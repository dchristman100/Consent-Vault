'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const router=useRouter()
  const [signup,setSignup]=useState(false)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('')
    const data=new FormData(event.currentTarget)
    const email=String(data.get('email')).trim(), password=String(data.get('password'))
    try {
      const result=signup ? await authClient.signUp.email({email,password,name:String(data.get('name')).trim()}) : await authClient.signIn.email({email,password})
      if(result.error) {setError(signup?'Unable to create account. Use a valid email and a password of at least 8 characters.':'Unable to sign in. Check your email and password.');return}
      router.push('/admin/sites');router.refresh()
    } catch {setError('Unable to connect. Please try again.')} finally {setLoading(false)}
  }
  return <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6"><section className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground p-8"><h1 className="text-2xl font-semibold text-balance">ConsentVault</h1><p className="my-4 text-muted-foreground">{signup?'Create your new account to get started.':'Sign in to manage your sites and recordings.'}</p><form onSubmit={submit} className="flex flex-col gap-4">{signup&&<label className="flex flex-col gap-2">Name<input name="name" required maxLength={100} autoComplete="name" className="rounded-md border p-3 bg-background text-foreground"/></label>}<label className="flex flex-col gap-2">Email<input name="email" type="email" required autoComplete="email" className="rounded-md border p-3 bg-background text-foreground"/></label><label className="flex flex-col gap-2">Password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={signup?'new-password':'current-password'} className="rounded-md border p-3 bg-background text-foreground"/></label>{error&&<p role="alert">{error}</p>}<button disabled={loading} className="rounded-md p-3 bg-primary text-primary-foreground disabled:opacity-50">{loading?'Please wait…':signup?'Create account':'Sign in'}</button><button type="button" onClick={()=>{setSignup(!signup);setError('')}} className="text-sm underline">{signup?'Already have an account? Sign in':'New here? Create account'}</button><Link href="/forgot-password" className="text-center text-sm underline">Forgot password?</Link></form></section></main>
}
