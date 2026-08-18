'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReset = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to send reset email')
        return
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Error sending reset email:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loading) handleReset()
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
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">ConsentVault</h1>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-900 mb-2">Reset Password</h2>

        {submitted ? (
          <p className="text-center text-sm text-slate-600 leading-relaxed mb-6">
            A password reset link has been sent to your email. Please check your inbox.
          </p>
        ) : (
          <>
            <p className="text-center text-sm text-slate-600 leading-relaxed mb-6">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  className="w-full px-3 text-sm text-slate-900 placeholder:text-slate-400 border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  style={{ height: '44px' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-white font-medium rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ height: '44px' }}
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-[#2563eb] hover:underline cursor-pointer">
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  )
}
