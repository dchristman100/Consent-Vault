'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Activity, CheckCircle, Clock, Zap, Trash2 } from 'lucide-react'
import { formatDate, truncateUrl, truncateUserAgent, getStatusColor, getStatusLabel, isSessionToday } from '@/lib/utils/sessions'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { toast } from 'sonner'
import { DeleteSessionDialog } from './delete-session-dialog'

interface Session {
  id: string
  visitor_id: string
  site_id: string
  page_url: string
  ip_address: string
  user_agent: string
  started_at: string
  submitted_at: string | null
  status: string
  event_count: number
  finalized_at: string | null
  sites?: {
    site_name: string
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<Array<{ id: string; site_name: string }>>([])
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [siteFilter, setSiteFilter] = useState('all')
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null })
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    recording: 0,
    completed: 0,
    today: 0,
  })

  // Delete confirmation state
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)

  const supabase = createClient()

  // Delete a session and remove it from the table without a reload
  const handleDeleteSession = async () => {
    if (!supabase || !sessionToDelete) return

    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionToDelete.id)

    if (error) {
      console.error('[v0] Failed to delete session:', error)
      toast.error('Failed to delete session. Please try again.')
      throw error
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id))
    toast.success('Session deleted successfully')
  }

  // Fetch sessions with joins
  const fetchSessions = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    try {
      let query = supabase
        .from('sessions')
        .select(`
          *,
          sites (site_name)
        `)
        .order('started_at', { ascending: false })

      // Apply filters
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (siteFilter && siteFilter !== 'all') {
        query = query.eq('site_id', siteFilter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching sessions:', error)
        return
      }

      // Debug: Log raw sessions data
      console.log('[v0] Sessions data loaded:', data?.length, 'records')

      let filtered = data || []

      // Client-side search filter
      if (searchTerm) {
        filtered = filtered.filter(
          (session) =>
            session.visitor_id.includes(searchTerm) ||
            session.page_url?.includes(searchTerm)
        )
      }

      // Client-side date range filter
      if (dateRange.from && dateRange.to) {
        filtered = filtered.filter((session) => {
          const startDate = new Date(session.started_at)
          return startDate >= dateRange.from && startDate <= dateRange.to
        })
      }

      setSessions(filtered)

      // Calculate stats
      const allSessions = data || []
      setStats({
        total: allSessions.length,
        recording: allSessions.filter((s) => s.status === 'recording').length,
        completed: allSessions.filter((s) => s.status === 'completed' || s.status === 'finalized').length,
        today: allSessions.filter((s) => isSessionToday(s.started_at)).length,
      })
    } finally {
      setLoading(false)
    }
  }, [supabase, statusFilter, siteFilter, searchTerm, dateRange])

  // Fetch sites
  const fetchSites = useCallback(async () => {
    if (!supabase) return

    try {
      const { data, error } = await supabase.from('sites').select('id, site_name')
      if (!error) {
        setSites(data || [])
      }
    } catch (err) {
      console.error('Error fetching sites:', err)
    }
  }, [supabase])

  // Initial fetch
  useEffect(() => {
    fetchSites()
    fetchSessions()
  }, [fetchSessions, fetchSites])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchSessions])

  const handleClearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setSiteFilter('all')
    setDateRange({ from: null, to: null })
  }

  return (
    <div className="p-8 space-y-8 bg-slate-50 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Sessions</h1>
        <p className="text-slate-600 mt-1 text-sm">Track and manage user consent recording sessions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Sessions */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Total Sessions</p>
              <p className="text-[28px] font-semibold text-slate-900 mt-3 leading-tight">{stats.total}</p>
            </div>
            <div className="bg-blue-100 rounded-xl p-2.5 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#16a34a]">↑ 12%</span>
            <span className="text-[13px] text-slate-500">vs last month</span>
          </div>
        </div>

        {/* Active Recording */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Active Recording</p>
              <p className="text-[28px] font-semibold text-blue-600 mt-3 leading-tight">{stats.recording}</p>
            </div>
            <div className="bg-red-100 rounded-xl p-2.5 flex items-center justify-center">
              <Zap className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#16a34a]">↑ 8%</span>
            <span className="text-[13px] text-slate-500">vs last month</span>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Completed Sessions</p>
              <p className="text-[28px] font-semibold text-green-600 mt-3 leading-tight">{stats.completed}</p>
            </div>
            <div className="bg-green-100 rounded-xl p-2.5 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#16a34a]">↑ 15%</span>
            <span className="text-[13px] text-slate-500">vs last month</span>
          </div>
        </div>

        {/* Today's Sessions */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Today's Sessions</p>
              <p className="text-[28px] font-semibold text-slate-900 mt-3 leading-tight">{stats.today}</p>
            </div>
            <div className="bg-purple-100 rounded-xl p-2.5 flex items-center justify-center">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            <span className="text-[13px] font-semibold text-[#16a34a]">↑ 5%</span>
            <span className="text-[13px] text-slate-500">vs yesterday</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-5">
        <div className="space-y-4">
          <div className="flex items-center gap-2 justify-between">
            <h3 className="text-[13px] font-medium text-slate-500">Filters</h3>
            <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs rounded-lg border-slate-200">
              Clear Filters
            </Button>
          </div>

          <div className="flex items-end gap-4">
            {/* Search */}
            <div className="flex-[2]">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Search</label>
              <Input
                placeholder="Search session ID or URL..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 rounded-lg border-slate-200 px-3 text-sm"
              />
            </div>

            {/* Status Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 px-3 text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="recording">Recording</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Site Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Site</label>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 px-3 text-sm">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.site_name || 'All Sites'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-900 font-medium mb-2">No sessions found</p>
            <p className="text-sm text-slate-600 mb-4">
              Install the recorder snippet on your website to start capturing sessions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc] border-b border-slate-200">
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Session ID</TableHead>
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Site</TableHead>
                  {/* <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Page URL</TableHead> */}
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">IP Address</TableHead>
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Started At</TableHead>
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Events</TableHead>
                  <TableHead className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.05em] px-4 py-3.5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id} className="hover:bg-[#f8fafc] border-b border-[#f1f5f9]">
                    <TableCell className="font-mono text-sm text-slate-900 px-4 py-3.5">
                      {session.visitor_id?.slice(0, 8) || session.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-900 px-4 py-3.5">{session.sites?.site_name || '-'}</TableCell>
                    {/* <TableCell title={session.page_url} className="text-sm text-slate-600 px-4 py-3.5">
                      {truncateUrl(session.page_url || '')}
                    </TableCell> */}
                    <TableCell className="text-sm text-slate-600 px-4 py-3.5">{session.ip_address || '-'}</TableCell>
                    <TableCell className="text-sm text-slate-600 px-4 py-3.5">
                      {formatDate(session.started_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Badge className={getStatusColor(session.status)}>
                        {getStatusLabel(session.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-900 font-medium px-4 py-3.5">{session.event_count}</TableCell>
                    <TableCell className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/sessions/${session.visitor_id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[13px] border border-slate-200 rounded-lg px-3.5 py-1.5 cursor-pointer hover:bg-[#eff6ff] hover:text-[#2563eb] hover:border-[#bfdbfe]"
                          >
                            Replay
                          </Button>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSessionToDelete(session)}
                          title="Delete Session"
                          aria-label="Delete Session"
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

      {/* Delete confirmation modal */}
      <DeleteSessionDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToDelete(null)
        }}
        sessionLabel={sessionToDelete?.visitor_id || ''}
        onConfirm={handleDeleteSession}
      />
    </div>
  )
}

