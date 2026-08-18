import { type NextRequest, NextResponse } from "next/server"

// Allow requests from any external origin (e.g. vsl.rooferfuel.ai)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  // Broad allow-list so the preflight never rejects client-sent headers
  // (supabase-js and some fetch wrappers add x-client-info, apikey, etc.).
  "Access-Control-Allow-Headers": "*, Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
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

const BUCKET = "session-recordings"

/**
 * Ensures the storage bucket exists, creating it (private) if missing.
 * Best-effort: returns true if the bucket exists or was created.
 */
async function ensureBucket(supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const getResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })

    if (getResponse.ok) {
      return true
    }

    // Bucket missing -> create it.
    console.log(`[ConsentVault] events: bucket "${BUCKET}" missing, creating it`)
    const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    })

    if (createResponse.ok) {
      return true
    }

    // If another request created it concurrently, treat "already exists" as success.
    const detail = await createResponse.text()
    if (createResponse.status === 409 || detail.includes("already exists")) {
      return true
    }

    console.error(`[ConsentVault] events: failed to create bucket ${createResponse.status} - ${detail}`)
    return false
  } catch (bucketError) {
    console.error("[ConsentVault] events: bucket check threw", bucketError)
    return false
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validate environment variables up front.
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[ConsentVault] events: missing env ${missingEnv}`)
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
      console.error("[ConsentVault] events: failed to parse body", parseError)
      return json(
        { error: `Invalid request body: ${parseError instanceof Error ? parseError.message : "unparseable"}` },
        400,
      )
    }

    const { site_key, session_id, events, batch_number } = body

    // 3. Validate that a session ID is present before writing any events.
    if (!session_id) {
      return json({ error: "Missing required field: session_id" }, 400)
    }
    if (!site_key) {
      return json({ error: "Missing required field: site_key" }, 400)
    }
    if (!Array.isArray(events) || events.length === 0) {
      return json({ error: "Missing or empty required field: events" }, 400)
    }
    if (batch_number === undefined || batch_number === null) {
      return json({ error: "Missing required field: batch_number" }, 400)
    }

    // 4. Make sure the storage bucket exists before uploading.
    const bucketReady = await ensureBucket(SUPABASE_URL, SERVICE_KEY)
    if (!bucketReady) {
      return json({ error: `Storage bucket "${BUCKET}" is unavailable and could not be created` }, 500)
    }

    // 5. Save the events batch to storage using the service role key.
    const storagePath = `${session_id}/batch-${batch_number}.json`
    const eventsJson = JSON.stringify(events)

    console.log(`[ConsentVault] events: uploading ${storagePath} (${events.length} events)`)

    const uploadResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          // Upsert so retried batches don't fail with a duplicate-object error.
          "x-upsert": "true",
        },
        body: eventsJson,
      },
    )

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text()
      console.error(`[ConsentVault] events: storage upload failed ${uploadResponse.status} - ${detail}`)
      return json(
        { error: `Failed to store events: ${uploadResponse.status} ${uploadResponse.statusText}`, detail },
        500,
      )
    }

    // 6. Record batch metadata in the database using the service role key.
    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/session_event_batches`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        session_id,
        batch_number,
        storage_path: storagePath,
        event_count: events.length,
      }),
    })

    if (!dbResponse.ok) {
      const detail = await dbResponse.text()
      console.error(`[ConsentVault] events: batch insert failed ${dbResponse.status} - ${detail}`)
      return json(
        { error: `Failed to record batch: ${dbResponse.status} ${dbResponse.statusText}`, detail },
        500,
      )
    }

    // 7. Update the session's running event count (best-effort).
    try {
      const sessionResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?session_id=eq.${session_id}&select=event_count`,
        {
          method: "GET",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
        },
      )

      let newCount = events.length
      if (sessionResponse.ok) {
        const sessions = await sessionResponse.json()
        if (sessions.length > 0) {
          newCount = (sessions[0].event_count || 0) + events.length
        }
      }

      await fetch(`${SUPABASE_URL}/rest/v1/sessions?session_id=eq.${session_id}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_count: newCount }),
      })
    } catch (countError) {
      // Non-fatal: the batch is already stored.
      console.error("[ConsentVault] events: failed to update event_count", countError)
    }

    return json(
      {
        success: true,
        batch_number,
        event_count: events.length,
        storage_path: storagePath,
      },
      200,
    )
  } catch (error) {
    console.error("[ConsentVault] events: unexpected error", error)
    return json(
      { error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}` },
      500,
    )
  }
}
