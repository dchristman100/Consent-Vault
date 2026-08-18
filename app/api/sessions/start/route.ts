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

/**
 * Returns the first missing required env var name, or null if all are present.
 */
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
    // 1. Validate environment variables up front so we never crash silently.
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[ConsentVault] start: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

    // 2. Parse body (supports JSON and sendBeacon form data).
    let body: any
    try {
      const contentType = request.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        body = await request.json()
      } else {
        const formData = await request.formData()
        body = JSON.parse((formData.get("data") as string) || "{}")
      }
    } catch (parseError) {
      console.error("[ConsentVault] start: failed to parse body", parseError)
      return json(
        { error: `Invalid request body: ${parseError instanceof Error ? parseError.message : "unparseable"}` },
        400,
      )
    }

    const { site_key, page_url, referrer, visitor_id, screen_width, screen_height } = body
    if (!site_key) {
      return json({ error: "Missing required field: site_key" }, 400)
    }

    // 3. Resolve site_id by matching site_key against the sites table.
    //    sessions.site_id is NOT NULL and is a foreign key to sites.id.
    const siteLookup = await fetch(
      `${SUPABASE_URL}/rest/v1/sites?site_key=eq.${encodeURIComponent(site_key)}&select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!siteLookup.ok) {
      const detail = await siteLookup.text()
      console.error(`[ConsentVault] start: site lookup failed ${siteLookup.status} - ${detail}`)
      return json(
        { error: `Failed to look up site: ${siteLookup.status} ${siteLookup.statusText}`, detail },
        500,
      )
    }

    const sites = await siteLookup.json()
    if (!Array.isArray(sites) || sites.length === 0) {
      console.error(`[ConsentVault] start: no site found for site_key ${site_key}`)
      return json({ error: `Invalid site_key: no matching site found` }, 400)
    }

    const site_id: string = sites[0].id

    // 4. Initialize the session. Generate IDs if they were not provided.
    const session_id: string =
      body.session_id ||
      (globalThis.crypto?.randomUUID?.() ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`)

    // visitor_id is NOT NULL in the schema, so always provide a value.
    const resolvedVisitorId: string =
      visitor_id ||
      (globalThis.crypto?.randomUUID?.() ?? `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`)

    // 5. Insert the session via the Supabase REST API using the service role key
    //    (bypasses RLS and avoids cookie-based auth for external callers).
    //    All nullable text columns fall back to "" instead of null.
    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        session_id,
        site_id,
        visitor_id: resolvedVisitorId,
        page_url: page_url ?? "",
        referrer: referrer ?? "",
        ip_address: request.headers.get("x-forwarded-for") || "",
        user_agent: request.headers.get("user-agent") || "",
        screen_width: screen_width ?? null,
        screen_height: screen_height ?? null,
        status: "recording",
      }),
    })

    if (!insertResponse.ok) {
      const detail = await insertResponse.text()
      console.error(`[ConsentVault] start: insert failed ${insertResponse.status} - ${detail}`)
      return json(
        { error: `Failed to create session: ${insertResponse.status} ${insertResponse.statusText}`, detail },
        500,
      )
    }

    const inserted = await insertResponse.json()
    console.log(`[ConsentVault] start: session created ${session_id} for site ${site_id}`)

    // 6. Always return the session ID so the recorder can attach events to it.
    return json(
      { success: true, session_id, visitor_id: resolvedVisitorId, site_id, session: inserted?.[0] ?? null },
      200,
    )
  } catch (error) {
    console.error("[ConsentVault] start: unexpected error", error)
    return json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      500,
    )
  }
}
