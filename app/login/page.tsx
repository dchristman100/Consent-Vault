'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

// Map a friendly username to the underlying Supabase auth email.
const usernameToEmail = (username: string) => {
  const map: Record<string, string> = {
    admin: 'admin@mailinator.com',
    david: 'david@mailinator.com',
  }
  return map[username.toLowerCase()] || username
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      })
      if (authError) {
        setError('Invalid username or password')
        return
      }
      router.push('/admin/sessions')
      router.refresh()
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loading) handleLogin()
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div
        className="w-full bg-white"
        style={{
          maxWidth: '420px',
          borderRadius: '12px',
          padding: '40px',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">ConsentVault</h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              className="w-full px-3 text-sm text-slate-900 placeholder:text-slate-400 border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              style={{ height: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full px-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                style={{ height: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-white font-medium rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ height: '44px' }}
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          {error && (
            <p className="text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Link
            href="/forgot-password"
            className="text-center text-sm text-[#2563eb] hover:underline cursor-pointer"
          >
            Forgot Password?
          </Link>
        </form>
      </div>
    </main>
  )
}
