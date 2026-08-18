// One-off script to create the two ConsentVault admin users via the Supabase
// Admin API. Uses the service role key. Safe to re-run (handles existing users).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const users = [
  { email: 'admin@mailinator.com', password: 'Admin@123', name: 'Admin' },
  { email: 'david@mailinator.com', password: 'David@123', name: 'David' },
]

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[v0] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  for (const u of users) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { display_name: u.name },
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      console.log(`[v0] Created user: ${u.email}`)
    } else if (
      res.status === 422 ||
      (body && typeof body.msg === 'string' && body.msg.toLowerCase().includes('already'))
    ) {
      console.log(`[v0] User already exists: ${u.email}`)
    } else {
      console.error(`[v0] Failed to create ${u.email}:`, res.status, body)
    }
  }
}

main()
