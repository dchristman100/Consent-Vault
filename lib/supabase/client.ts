import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Return null if environment variables are missing
  if (!url || !key) {
    console.warn('Supabase environment variables not configured')
    return null as any
  }

  return createBrowserClient(url, key)
}
