'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { generateSiteKey } from '@/lib/utils/sites'

interface CreateSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSiteCreated: () => void
}

export function CreateSiteDialog({
  open,
  onOpenChange,
  onSiteCreated,
}: CreateSiteDialogProps) {
  const [siteName, setSiteName] = useState('')
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)

  // Initialize Supabase client on mount
  useEffect(() => {
    setSupabase(createClient())
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!siteName.trim()) {
      toast.error('Site name is required')
      return
    }

    if (!domain.trim()) {
      toast.error('Domain is required')
      return
    }

    if (!supabase) {
      toast.error('Supabase not initialized')
      return
    }

    try {
      setLoading(true)

      // Get authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error('[v0] Auth error:', authError)
        throw new Error('Not authenticated. Please log in.')
      }

      const siteKey = generateSiteKey(siteName)

      const { error } = await supabase.from('sites').insert({
        site_name: siteName,
        domain,
        site_key: siteKey,
        status: 'active',
        user_id: user.id,
      })

      if (error) {
        console.error('[v0] Insert error:', error)
        throw error
      }

      toast.success(`Site "${siteName}" created successfully`)
      setSiteName('')
      setDomain('')
      onOpenChange(false)
      onSiteCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create site'
      console.error('[v0] Create site error:', message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !loading) {
      setSiteName('')
      setDomain('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Site</DialogTitle>
          <DialogDescription>
            Add a new website to track consent events
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="site-name">Site Name</Label>
            <Input
              id="site-name"
              placeholder="e.g., My Awesome Website"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              placeholder="e.g., example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Site'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
