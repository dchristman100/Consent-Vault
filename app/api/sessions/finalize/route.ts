import { type NextRequest, NextResponse } from "next/server"

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
      console.error(`[ConsentVault] finalize: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

    let body: any
    try {
      const contentType = request.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        body = await request.json()
      } else {
        // sendBeacon sends as form data
        const formData = await request.formData()
        body = JSON.parse((formData.get("data") as string) || "{}")
      }
    } catch (parseError) {
      console.error("[ConsentVault] finalize: failed to parse body", parseError)
      return json(
        { error: `Invalid request body: ${parseError instanceof Error ? parseError.message : "unparseable"}` },
        400,
      )
    }

    const { site_key, session_id, page_url } = body

    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400)
    }
    if (!site_key) {
      return json({ error: "Missing required field: site_key" }, 400)
    }

    console.log(`[ConsentVault] finalize: finalizing session ${session_id}`)

    // Fetch all event batches for this session
    const batchesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/session_event_batches?session_id=eq.${session_id}&order=batch_number.asc`,
      {
        method: "GET",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!batchesResponse.ok) {
      const detail = await batchesResponse.text()
      console.error(`[ConsentVault] finalize: fetch batches failed ${batchesResponse.status} - ${detail}`)
      return json(
        { error: `Failed to fetch batches: ${batchesResponse.status} ${batchesResponse.statusText}`, detail },
        500,
      )
    }

    const batches: any[] = await batchesResponse.json()
    console.log(`[ConsentVault] finalize: found ${batches.length} event batches`)

    // Download all batch files from storage and merge events
    let allEvents: any[] = []

    for (const batch of batches) {
      const downloadResponse = await fetch(
        `${SUPABASE_URL}/storage/v1/object/session-recordings/${batch.storage_path}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
        },
      )

      if (!downloadResponse.ok) {
        const detail = await downloadResponse.text()
        console.error(
          `[ConsentVault] finalize: download batch ${batch.storage_path} failed ${downloadResponse.status} - ${detail}`,
        )
        continue
      }

      try {
        const batchEvents = await downloadResponse.json()
        allEvents = allEvents.concat(batchEvents)
      } catch (parseError) {
        console.error(`[ConsentVault] finalize: failed to parse batch ${batch.storage_path}`, parseError)
      }
    }

    // Sort all events by timestamp
    allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    console.log(`[ConsentVault] finalize: total merged events ${allEvents.length}`)

    // Save merged events to storage
    const mergedEventsPath = `${session_id}/events.json`
    const uploadResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/session-recordings/${mergedEventsPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(allEvents),
      },
    )

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text()
      // Don't fail the finalize if upload fails - continue with database update
      console.error(`[ConsentVault] finalize: merged events upload failed ${uploadResponse.status} - ${detail}`)
    } else {
      console.log("[ConsentVault] finalize: merged events saved to storage")
    }

    // Update session to finalized status
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      status: "finalized",
      finalized_at: now,
      submitted_at: now,
      events_file_url: mergedEventsPath,
    }
    // Record the page_url captured at submit time if provided.
    if (page_url) {
      updatePayload.page_url = page_url
    }
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/sessions?session_id=eq.${session_id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updatePayload),
    })

    if (!updateResponse.ok) {
      const detail = await updateResponse.text()
      console.error(`[ConsentVault] finalize: session update failed ${updateResponse.status} - ${detail}`)
      return json(
        { error: `Failed to finalize session: ${updateResponse.status} ${updateResponse.statusText}`, detail },
        500,
      )
    }

    const finalizedSessions = await updateResponse.json()
    console.log(`[ConsentVault] finalize: session ${session_id} finalized`)

    return json(
      {
        success: true,
        session: finalizedSessions?.[0] ?? null,
        total_events: allEvents.length,
        batches_processed: batches.length,
      },
      200,
    )
  } catch (error) {
    console.error("[ConsentVault] finalize: unexpected error", error)
    return json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      500,
    )
  }
}
