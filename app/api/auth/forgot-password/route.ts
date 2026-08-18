import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { createAdminClient } from "@/lib/supabase/admin"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders })
}

/**
 * Returns the SMTP auth username. Gmail (and most providers) require the
 * full email address as the username. If SMTP_USER is missing or still set
 * to a placeholder, fall back to SMTP_FROM_EMAIL.
 */
function getSmtpUser(): string | undefined {
  const user = process.env.SMTP_USER
  if (user && user.includes("@")) return user
  return process.env.SMTP_FROM_EMAIL
}

/**
 * Returns the first missing required env var name, or null if all are present.
 */
function getMissingEnv(): string | null {
  if (!process.env.SMTP_HOST) return "SMTP_HOST"
  if (!process.env.SMTP_PORT) return "SMTP_PORT"
  if (!getSmtpUser()) return "SMTP_USER / SMTP_FROM_EMAIL"
  if (!process.env.SMTP_PASSWORD) return "SMTP_PASSWORD"
  if (!process.env.SMTP_FROM_EMAIL) return "SMTP_FROM_EMAIL"
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return "NEXT_PUBLIC_SUPABASE_URL"
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY"
  return null
}

/**
 * Hashes a token using SHA-256. We only ever store the hash in the database,
 * never the raw token, so a database leak can't be used to reset passwords.
 */
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
    // 1. Validate environment variables
    const missingEnv = getMissingEnv()
    if (missingEnv) {
      console.error(`[v0] forgot-password: missing env ${missingEnv}`)
      return json({ error: `Missing env: ${missingEnv}` }, 500)
    }

    // 2. Parse request body
    let body: { email?: unknown }
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[v0] forgot-password: failed to parse body", parseError)
      return json({ error: "Invalid request body" }, 400)
    }

    const { email } = body
    if (!email || typeof email !== "string") {
      return json({ error: "Email is required" }, 400)
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = createAdminClient()

    // 3. Check if a user with this email exists via the Auth Admin API.
    let userExists = false
    try {
      const { data, error } = await supabase.auth.admin.listUsers()
      if (error) {
        console.error("[v0] forgot-password: listUsers error", error.message)
        return json({ error: `Failed to look up user: ${error.message}` }, 500)
      }
      userExists = data.users.some(
        (u) => u.email?.toLowerCase() === normalizedEmail,
      )
    } catch (lookupError) {
      console.error("[v0] forgot-password: user lookup failed", lookupError)
      return json({ error: "Failed to look up user" }, 500)
    }

    // Explicitly tell the caller when no account exists.
    if (!userExists) {
      return json(
        {
          success: false,
          error: "No account found with that email address.",
        },
        404,
      )
    }

    // 4. Generate a secure reset token (raw token goes in the email link,
    //    only its hash is stored in the database).
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
    const tokenHex = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
    const tokenHash = await hashToken(tokenHex)
    const expiresAt = new Date(Date.now() + 3600_000).toISOString() // 1 hour

    // 5. Store the token hash in the password_reset_tokens table.
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        email: normalizedEmail,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error(
        "[v0] forgot-password: token insert failed",
        insertError.message,
      )
      return json(
        { error: `Failed to create reset token: ${insertError.message}` },
        500,
      )
    }

    // 6. Send the reset email via Nodemailer / SMTP.
    const host = process.env.SMTP_HOST || ""
    const isGmail = host.includes("gmail.com")
    // Gmail's STARTTLS port (587) is unreliable in some serverless/sandbox
    // environments, so prefer implicit TLS on 465 for Gmail.
    const port = isGmail
      ? 465
      : Number.parseInt(process.env.SMTP_PORT || "587", 10)
    const secure = isGmail ? true : process.env.SMTP_SECURE === "true" || port === 465

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: getSmtpUser(),
        pass: process.env.SMTP_PASSWORD,
      },
    })

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const resetLink = `${appUrl}/reset-password?token=${tokenHex}`

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL,
        to: normalizedEmail,
        subject: "Password Reset Request - ConsentVault",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
            <h2 style="margin-bottom: 16px;">Password Reset Request</h2>
            <p>We received a request to reset your password. Click the button below to choose a new one:</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${resetLink}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">ConsentVault - Consent Management</p>
          </div>
        `,
        text: `Password Reset Request\n\nWe received a request to reset your password. Visit this link to reset it:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, you can ignore this email.`,
      })
      console.log(`[v0] forgot-password: email sent to ${normalizedEmail}`)
    } catch (emailError) {
      console.error("[v0] forgot-password: email send failed", emailError)
      return json(
        {
          error: `Failed to send email: ${
            emailError instanceof Error ? emailError.message : "Unknown error"
          }`,
        },
        500,
      )
    }

    return json(
      {
        success: true,
        message: "A password reset link has been sent to your email.",
      },
      200,
    )
  } catch (error) {
    console.error("[v0] forgot-password: unexpected error", error)
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
