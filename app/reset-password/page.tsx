'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)

  useEffect(() => {
    // Validate token on mount
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.')
      setValidating(false)
      return
    }

    const validateToken = async () => {
      try {
        const response = await fetch('/api/auth/verify-reset-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        })

        if (response.ok) {
          setTokenValid(true)
        } else {
          const data = await response.json()
          setError(data.error || 'Invalid or expired reset link.')
        }
      } catch (err) {
        console.error('Error validating token:', err)
        setError('Failed to validate reset link. Please try again.')
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to reset password. Please try again.')
        return
      }

      setSuccess(true)
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      console.error('Error resetting password:', err)
      setError('Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (validating) {
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
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">ConsentVault</h1>
          </div>
          <div className="flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        </div>
      </main>
    )
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

        {!tokenValid && !success ? (
          <>
            <h2 className="text-center text-lg font-bold text-slate-900 mb-2">Invalid Reset Link</h2>
            <p className="text-center text-sm text-slate-600 leading-relaxed mb-6">{error}</p>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-[#2563eb] hover:underline">
                Request a new password reset
              </Link>
            </div>
          </>
        ) : success ? (
          <>
            <h2 className="text-center text-lg font-bold text-slate-900 mb-2">Password Reset Successful</h2>
            <p className="text-center text-sm text-slate-600 leading-relaxed mb-6">
              Your password has been reset successfully. Redirecting to login...
            </p>
          </>
        ) : (
          <>
            <h2 className="text-center text-lg font-bold text-slate-900 mb-2">Reset Your Password</h2>
            <p className="text-center text-sm text-slate-600 leading-relaxed mb-6">
              Enter a new password for your account.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="w-full px-3 text-sm text-slate-900 placeholder:text-slate-400 border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  style={{ height: '44px' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
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
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm text-[#2563eb] hover:underline">
                Back to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
