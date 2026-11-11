import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ChangePasswordForm } from '@/components/change-password-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Account settings | ConsentVault',
  description: 'Manage your ConsentVault account password.',
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  return (
    <section className="p-6 text-foreground md:p-8">
      <div className="flex max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-balance text-2xl font-semibold">Account settings</h1>
          <p className="break-all text-sm leading-relaxed text-muted-foreground">Signed in as {session.user.email}</p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Choose a new password for your account. Updating it signs you out on other devices.</CardDescription>
          </CardHeader>
          <CardContent><ChangePasswordForm /></CardContent>
        </Card>
      </div>
    </section>
  )
}
