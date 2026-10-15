import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import nodemailer from 'nodemailer'
import { after } from 'next/server'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      after(async () => {
        try {
          const transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
            auth: { user: process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS },
          })
          await transport.sendMail({
            from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM,
            to: user.email,
            subject: 'Reset your ConsentVault password',
            text: `Use this link to reset your password: ${url}\nIf you did not request this, ignore this message.`,
          })
        } catch (error) { console.error('Password recovery email failed', error) }
      })
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000', ...[
          process.env.V0_RUNTIME_URL,
          process.env.V0_DEV_APP_URL,
          process.env.V0_BUILD_URL,
          process.env.V0_SANDBOX_URL,
        ].filter((origin): origin is string => Boolean(origin))]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
          .filter((origin): origin is string => Boolean(origin))
          .map(origin => `https://${origin}`)
      : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          // Required for authentication inside the cross-site v0 preview iframe.
          defaultCookieAttributes: { sameSite: 'none' as const, secure: true },
        },
      }
    : {}),
})
