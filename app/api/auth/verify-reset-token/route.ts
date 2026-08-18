import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders })
}

function getMissingEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL"
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY"
  return null
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[v0] verify-reset-token: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    let body: { token?: unknown }
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[v0] verify-reset-token: failed to parse body", parseError)
      return json({ error: "Invalid request body" }, 400)
    }

    const { token } = body
    if (!token || typeof token !== "string") {
      return json({ error: "Token is required" }, 400)
    }

    const supabase = createAdminClient()
    const tokenHash = await hashToken(token)

    const { data: tokenRecord, error } = await supabase
      .from("password_reset_tokens")
      .select("id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (error) {
      console.error("[v0] verify-reset-token: lookup failed", error.message)
      return json({ error: "Invalid reset token" }, 400)
    }

    if (!tokenRecord) {
      return json({ error: "Invalid reset token" }, 400)
    }

    if (tokenRecord.used_at) {
      return json({ error: "This reset link has already been used" }, 400)
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return json({ error: "This reset link has expired" }, 400)
    }

    return json({ success: true, email: tokenRecord.email }, 200)
  } catch (error) {
    console.error("[v0] verify-reset-token: unexpected error", error)
    return json(
      {
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      500,
    )
  }
}
