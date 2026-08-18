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
      console.error(`[v0] reset-password: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    let body: { token?: unknown; password?: unknown }
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[v0] reset-password: failed to parse body", parseError)
      return json({ error: "Invalid request body" }, 400)
    }

    const { token, password } = body
    if (!token || typeof token !== "string") {
      return json({ error: "Token is required" }, 400)
    }
    if (!password || typeof password !== "string") {
      return json({ error: "Password is required" }, 400)
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters long" }, 400)
    }

    const supabase = createAdminClient()
    const tokenHash = await hashToken(token)

    // 1. Look up and validate the token.
    const { data: tokenRecord, error: lookupError } = await supabase
      .from("password_reset_tokens")
      .select("id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (lookupError) {
      console.error("[v0] reset-password: lookup failed", lookupError.message)
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

    const email = (tokenRecord.email as string).toLowerCase()

    // 2. Find the auth user matching the token's email.
    const { data: usersData, error: listError } =
      await supabase.auth.admin.listUsers()

    if (listError) {
      console.error("[v0] reset-password: listUsers failed", listError.message)
      return json({ error: "Failed to update password" }, 500)
    }

    const user = usersData.users.find(
      (u) => u.email?.toLowerCase() === email,
    )

    if (!user) {
      console.error("[v0] reset-password: no auth user for token email")
      return json({ error: "Failed to update password" }, 500)
    }

    // 3. Update the user's password via the Auth Admin API.
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password },
    )

    if (updateError) {
      console.error(
        "[v0] reset-password: password update failed",
        updateError.message,
      )
      return json({ error: "Failed to update password" }, 500)
    }

    // 4. Mark the token as used so it can't be reused.
    const { error: markUsedError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id)

    if (markUsedError) {
      // Non-fatal: password was already updated successfully.
      console.error(
        "[v0] reset-password: mark used failed",
        markUsedError.message,
      )
    }

    console.log(`[v0] reset-password: password reset successful for ${email}`)
    return json({ success: true, message: "Password reset successful" }, 200)
  } catch (error) {
    console.error("[v0] reset-password: unexpected error", error)
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
