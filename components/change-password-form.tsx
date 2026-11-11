'use client'

import { useState } from 'react'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'

export function ChangePasswordForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    const form = event.currentTarget
    const data = new FormData(form)
    const currentPassword = String(data.get('currentPassword') || '')
    const newPassword = String(data.get('newPassword') || '')
    setError('')
    setSuccess(false)
    if (newPassword !== data.get('confirmPassword')) {
      setError('The new passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (result.error) {
        setError('Unable to update your password. Check your current password and try again. If your session expired, sign in again.')
        return
      }
      form.reset()
      setSuccess(true)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="current-password">Current password</FieldLabel>
          <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={loading} />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby="password-help" disabled={loading} />
          <FieldDescription id="password-help">Use between 8 and 128 characters.</FieldDescription>
        </Field>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
          <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={loading} aria-invalid={Boolean(error)} aria-describedby={error ? 'password-error' : undefined} />
          {error && <FieldError id="password-error">{error}</FieldError>}
        </Field>
        {success && <p role="status" className="text-sm text-foreground">Password updated. Your other sessions have been signed out.</p>}
        <Button type="submit" disabled={loading}>{loading ? 'Updating password…' : 'Update password'}</Button>
        <Link href="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4">Forgot your current password?</Link>
      </FieldGroup>
    </form>
  )
}
