'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils/sites'
import { CreateSiteDialog } from './create-site-dialog'
import { SnippetDialog } from './snippet-dialog'
import { DeleteSiteDialog } from './delete-site-dialog'

interface Site {
  id: string
  site_name: string
  domain: string
  site_key: string
  status: string
  created_at: string
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [showSnippetDialog, setShowSnippetDialog] = useState(false)
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null)

  useEffect(() => {
    setSupabase(createClient())
  }, [])

  useEffect(() => {
    if (!supabase) return
    fetchSites()
  }, [supabase])

  const fetchSites = async () => {
    if (!supabase) return
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('sites')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setSites(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sites'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSiteCreated = () => {
    setShowCreateDialog(false)
    fetchSites()
  }

  const handleCopySnippet = (site: Site) => {
    setSelectedSite(site)
    setShowSnippetDialog(true)
  }

  const handleDeleteSite = async () => {
    if (!supabase || !siteToDelete) return

    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteToDelete.id)

    if (error) {
      console.error('[v0] Failed to delete site:', error)
      toast.error('Failed to delete site. Please try again.')
      throw error
    }

    setSites((prev) => prev.filter((s) => s.id !== siteToDelete.id))
    toast.success('Site deleted successfully')
  }

  const getStatusColor = (status: string) => {
    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }

  if (error && sites.length === 0) {
    return (
      <div className="p-8 bg-slate-50 min-h-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Sites</h1>
          <p className="text-slate-600 mt-1 text-sm">Manage consent-enabled websites</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="text-red-600">Error: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-slate-50 min-h-full space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sites</h1>
          <p className="text-slate-600 mt-1 text-sm">Manage consent-enabled websites</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">New Site</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-500">Loading sites...</div>
        ) : sites.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-900 font-medium mb-2">No sites yet</p>
            <p className="text-sm text-slate-600">Create your first site to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-t border-slate-200 bg-slate-50">
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase">Site Name</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase">Domain</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase">Site Key</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase">Created At</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700 uppercase text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id} className="hover:bg-slate-50 border-b border-slate-200">
                    <TableCell className="font-medium text-slate-900">{site.site_name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{site.domain}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600 max-w-xs truncate">
                      {site.site_key}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(site.status)}>
                        {site.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDate(site.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopySnippet(site)}
                          className="text-xs"
                        >
                          Copy Snippet
                        </Button>
                        <button
                          type="button"
                          onClick={() => setSiteToDelete(site)}
                          title="Delete Site"
                          aria-label="Delete Site"
                          className="text-[#ef4444] rounded-md p-1.5 hover:bg-[#fef2f2] transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateSiteDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSiteCreated={handleSiteCreated}
      />

      {selectedSite && (
        <SnippetDialog
          open={showSnippetDialog}
          onOpenChange={setShowSnippetDialog}
          site={selectedSite}
        />
      )}

      {/* Delete confirmation modal */}
      <DeleteSiteDialog
        open={siteToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSiteToDelete(null)
        }}
        siteLabel={siteToDelete?.site_name || ''}
        onConfirm={handleDeleteSite}
      />
    </div>
  )
}
