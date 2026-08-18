import { type NextRequest, NextResponse } from "next/server"

// Allow requests from any external origin (e.g. vsl.rooferfuel.ai)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders })
}

function getMissingEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL"
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY"
  return null
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[ConsentVault] screenshot: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

    // Parse body
    let body: any
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[ConsentVault] screenshot: failed to parse body", parseError)
      return json({ error: "Invalid request body" }, 400)
    }

    const { session_id, site_key, screenshot, captured_at } = body
    console.log("[ConsentVault] screenshot received for session:", session_id, "size:", screenshot?.length)
    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400)
    }
    if (!screenshot || typeof screenshot !== "string") {
      return json({ error: "Missing required field: screenshot" }, 400)
    }

    // Convert base64 data URL (data:image/jpeg;base64,....) to a binary buffer.
    const match = screenshot.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!match) {
      return json({ error: "Invalid screenshot data URL format" }, 400)
    }
    const contentType = match[1]
    const base64Data = match[2]
    const binary = Buffer.from(base64Data, "base64")
    const extension = contentType.split("/")[1] || "jpeg"

    // Build a unique storage path.
    const objectPath = `${session_id}/${Date.now()}.${extension}`

    // Upload to the public 'screenshots' storage bucket via the Storage REST API.
    const uploadResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/screenshots/${objectPath}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: binary,
      },
    )

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text()
      console.error(`[ConsentVault] screenshot: upload failed ${uploadResponse.status} - ${detail}`)
      return json(
        { error: `Failed to upload screenshot: ${uploadResponse.status}`, detail },
        500,
      )
    }

    // Public URL for the uploaded object.
    const screenshot_url = `${SUPABASE_URL}/storage/v1/object/public/screenshots/${objectPath}`

    // Upsert metadata into the screenshots table (one row per session_id).
    // resolution=merge-duplicates + the unique constraint on session_id means
    // a re-submission overwrites the previous screenshot record cleanly.
    const insertResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/screenshots?on_conflict=session_id`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          session_id,
          site_key: site_key ?? null,
          screenshot_url,
          captured_at: captured_at ?? new Date().toISOString(),
        }),
      },
    )

    if (!insertResponse.ok) {
      const detail = await insertResponse.text()
      console.error(`[ConsentVault] screenshot: insert failed ${insertResponse.status} - ${detail}`)
      return json(
        { error: `Failed to save screenshot record: ${insertResponse.status}`, detail },
        500,
      )
    }

    const inserted = await insertResponse.json()
    console.log(`[ConsentVault] screenshot: saved for session ${session_id}`)

    return json({ success: true, screenshot_url, record: inserted?.[0] ?? null }, 200)
  } catch (error) {
    console.error("[ConsentVault] screenshot: unexpected error", error)
    return json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      500,
    )
  }
}
