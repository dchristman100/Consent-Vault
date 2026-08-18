import { type NextRequest, NextResponse } from "next/server"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*, Content-Type, Authorization, apikey",
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders })
}

function getMissingEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL"
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY"
  return null
}

const BUCKET = "session-recordings"

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

// Returns the merged, time-sorted rrweb events for a session.
// The incoming [session_id] param is actually the visitor_id (that is what the
// admin UI routes with), so we first resolve the real session_id, then fetch
// batches from storage using the service role key (the bucket is private and
// cannot be read with the anon key from the browser).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[ConsentVault] recording: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

    const { session_id: visitorOrSessionId } = await params
    if (!visitorOrSessionId) {
      return json({ error: "Missing session identifier" }, 400)
    }

    const restHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    }

    // Resolve the session: the URL param may be a visitor_id or a session_id.
    const sessionLookup = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?or=(visitor_id.eq.${encodeURIComponent(
        visitorOrSessionId,
      )},session_id.eq.${encodeURIComponent(
        visitorOrSessionId,
      )})&select=session_id,events_file_url&limit=1`,
      { method: "GET", headers: restHeaders },
    )

    if (!sessionLookup.ok) {
      const detail = await sessionLookup.text()
      console.error(`[ConsentVault] recording: session lookup failed ${sessionLookup.status} - ${detail}`)
      return json({ error: `Failed to look up session: ${sessionLookup.status}`, detail }, 500)
    }

    const sessions = await sessionLookup.json()
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return json({ error: "Session not found" }, 404)
    }

    const realSessionId: string = sessions[0].session_id
    const eventsFileUrl: string | null = sessions[0].events_file_url

    async function downloadJson(path: string): Promise<any[] | null> {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: "GET",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      })
      if (!res.ok) {
        console.warn(`[ConsentVault] recording: download failed ${res.status} for ${path}`)
        return null
      }
      try {
        const parsed = await res.json()
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch (err) {
        console.warn(`[ConsentVault] recording: parse failed for ${path}`, err)
        return null
      }
    }

    // Fast path: merged events file from finalize.
    if (eventsFileUrl) {
      const merged = await downloadJson(eventsFileUrl)
      if (merged && merged.length > 0) {
        merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        return json({ session_id: realSessionId, source: "merged", events: merged }, 200)
      }
    }

    // Fallback: reconstruct from individual batches keyed by the real session_id.
    const batchLookup = await fetch(
      `${SUPABASE_URL}/rest/v1/session_event_batches?session_id=eq.${encodeURIComponent(
        realSessionId,
      )}&select=batch_number,storage_path&order=batch_number.asc`,
      { method: "GET", headers: restHeaders },
    )

    if (!batchLookup.ok) {
      const detail = await batchLookup.text()
      console.error(`[ConsentVault] recording: batch lookup failed ${batchLookup.status} - ${detail}`)
      return json({ error: `Failed to look up batches: ${batchLookup.status}`, detail }, 500)
    }

    const batches = await batchLookup.json()
    if (!Array.isArray(batches) || batches.length === 0) {
      return json({ session_id: realSessionId, source: "none", events: [] }, 200)
    }

    const allEvents: any[] = []
    for (const batch of batches) {
      const batchEvents = await downloadJson(batch.storage_path)
      if (batchEvents) allEvents.push(...batchEvents)
    }

    allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    console.log(
      `[ConsentVault] recording: returning ${allEvents.length} events for session ${realSessionId} from ${batches.length} batches`,
    )

    return json({ session_id: realSessionId, source: "batches", events: allEvents }, 200)
  } catch (error) {
    console.error("[ConsentVault] recording: unexpected error", error)
    return json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      500,
    )
  }
}
