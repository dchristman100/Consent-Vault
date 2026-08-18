'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils/sessions'
import Link from 'next/link'
import { Copy, Check, Trash2, ArrowLeft, Eye, Download } from 'lucide-react'
import { toast } from 'sonner'
import { DeleteSessionDialog } from '../delete-session-dialog'

interface Session {
  id: string
  session_id: string
  visitor_id: string
  page_url: string
  ip_address: string
  user_agent: string
  started_at: string
  submitted_at: string | null
  finalized_at: string | null
  status: string
  event_count: number
  events_file_url: string | null
  sites?: {
    site_name: string
  }
}

interface EventBatch {
  id: string
  session_id: string
  batch_number: number
  storage_path: string
  event_count: number
  created_at: string
}

interface RRWebEvent {
  type: number
  data: any
  timestamp: number
}

export default function SessionReplayPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.session_id as string

  const [session, setSession] = useState<Session | null>(null)
  const [batches, setBatches] = useState<EventBatch[]>([])
  const [events, setEvents] = useState<RRWebEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [screenshot, setScreenshot] = useState<{ screenshot_url: string; captured_at: string | null } | null>(null)

  const supabase = createClient()

  // Delete the current session and redirect back to the list
  const handleDeleteSession = async () => {
    if (!supabase || !session) return

    const { error: deleteError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', session.id)

    if (deleteError) {
      console.error('[v0] Failed to delete session:', deleteError)
      toast.error('Failed to delete session. Please try again.')
      throw deleteError
    }

    toast.success('Session deleted successfully')
    router.push('/admin/sessions')
  }

  // Generate PDF report
  const generatePDF = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      // Create script tag to load jsPDF
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      script.onload = async () => {
        try {
          console.log('[v0] jsPDF loaded, creating document...')
          const jsPDF = (window as any).jspdf.jsPDF
          if (!jsPDF) {
            throw new Error('jsPDF constructor not found')
          }
          const doc = new jsPDF('p', 'mm', 'a4')
          const pageWidth = doc.internal.pageSize.getWidth()

          // Header bar
          doc.setFillColor(37, 99, 235)
          doc.rect(0, 0, pageWidth, 20, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(12)
          doc.text('ConsentVault — Session Report', 10, 13)

          // Page 1 title
          doc.setTextColor(0, 0, 0)
          doc.setFontSize(18)
          doc.text('Session Details', 10, 35)

          // Draw a line
          doc.setDrawColor(226, 232, 240)
          doc.line(10, 40, pageWidth - 10, 40)

          // Session fields
          const fields = [
            ['Session ID', session?.visitor_id || 'N/A'],
            ['Site Name', session?.sites?.site_name || 'N/A'],
            ['Page URL', session?.page_url || 'N/A'],
            ['IP Address', session?.ip_address || 'N/A'],
            ['Status', session?.status || 'N/A'],
            ['Started At', session?.started_at ? new Date(session.started_at).toLocaleString() : 'N/A'],
            ['Submitted At', session?.submitted_at ? new Date(session.submitted_at).toLocaleString() : 'N/A'],
            ['Finalized At', session?.finalized_at ? new Date(session.finalized_at).toLocaleString() : 'N/A'],
            ['Event Count', String(session?.event_count || 0)],
            ['User Agent', session?.user_agent || 'N/A'],
          ]

          let y = 52
          fields.forEach(([label, value]) => {
            doc.setFontSize(10)
            doc.setTextColor(100, 116, 139)
            doc.text(label + ':', 10, y)
            doc.setTextColor(30, 30, 30)
            const lines = doc.splitTextToSize(value, 130)
            doc.text(lines, 65, y)
            y += lines.length > 1 ? lines.length * 7 : 12
          })

          // Footer page 1
          doc.setFontSize(9)
          doc.setTextColor(150, 150, 150)
          doc.text(`Generated by ConsentVault — ${new Date().toLocaleString()}`, 10, 285)
          doc.text('Page 1 of 2', pageWidth - 30, 285)

          // Page 2 — Events
          doc.addPage()

          // Header bar page 2
          doc.setFillColor(37, 99, 235)
          doc.rect(0, 0, pageWidth, 20, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(12)
          doc.text('ConsentVault — Session Report', 10, 13)

          doc.setTextColor(0, 0, 0)
          doc.setFontSize(18)
          doc.text('Form Submission Screenshot', 10, 35)
          doc.setDrawColor(226, 232, 240)
          doc.line(10, 40, pageWidth - 10, 40)

          const pageHeight = doc.internal.pageSize.getHeight()
          if (screenshot && screenshot.screenshot_url) {
            try {
              // Load the screenshot through a canvas to produce embeddable JPEG data.
              const imgData: string = await new Promise((res, rej) => {
                const img = new Image()
                img.crossOrigin = 'anonymous'
                img.onload = () => {
                  try {
                    const canvas = document.createElement('canvas')
                    canvas.width = img.width
                    canvas.height = img.height
                    const ctx = canvas.getContext('2d')
                    ctx?.drawImage(img, 0, 0)
                    res(canvas.toDataURL('image/jpeg'))
                  } catch (e) {
                    rej(e)
                  }
                }
                img.onerror = () => rej(new Error('Failed to load screenshot image'))
                img.src = screenshot.screenshot_url
              })

              // Fit the image within the page while preserving aspect ratio.
              const maxW = pageWidth - 20
              const maxH = pageHeight - 60
              const props = doc.getImageProperties(imgData)
              const ratio = Math.min(maxW / props.width, maxH / props.height)
              const drawW = props.width * ratio
              const drawH = props.height * ratio
              doc.addImage(imgData, 'JPEG', 10, 50, drawW, drawH)

              if (screenshot.captured_at) {
                doc.setFontSize(9)
                doc.setTextColor(100, 116, 139)
                doc.text(`Captured at: ${new Date(screenshot.captured_at).toLocaleString()}`, 10, 47)
              }
            } catch (imgErr) {
              console.error('[v0] Failed to embed screenshot in PDF:', imgErr)
              doc.setFontSize(11)
              doc.setTextColor(100, 116, 139)
              doc.text('Screenshot could not be embedded.', 10, 52)
            }
          } else {
            doc.setFontSize(11)
            doc.setTextColor(100, 116, 139)
            doc.text('No screenshot captured for this session', 10, 52)
          }

          // Footer page 2
          doc.setFontSize(9)
          doc.setTextColor(150, 150, 150)
          doc.text(`Generated by ConsentVault — ${new Date().toLocaleString()}`, 10, 285)
          doc.text('Page 2 of 2', pageWidth - 30, 285)

          console.log('[v0] PDF document created successfully')
          resolve(doc)
        } catch (err) {
          console.error('[v0] PDF creation error:', err)
          reject(err)
        }
      }
      script.onerror = () => {
        console.error('[v0] Failed to load jsPDF script')
        reject(new Error('Failed to load jsPDF library'))
      }
      document.head.appendChild(script)
    })
  }

  const handleDownload = async () => {
    try {
      setGeneratingPDF(true)
      const doc = await generatePDF()
      doc.save(`session-${session?.visitor_id?.slice(0, 8) || 'report'}.pdf`)
      toast.success('PDF downloaded successfully')
    } catch (err) {
      console.error('[v0] PDF download error:', err)
      toast.error('Failed to generate PDF')
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handlePreview = async () => {
    try {
      setGeneratingPDF(true)
      const doc = await generatePDF()
      const blobUrl = doc.output('bloburi')
      window.open(blobUrl, '_blank')
      toast.success('PDF opened in preview')
    } catch (err) {
      console.error('[v0] PDF preview error:', err)
      toast.error('Failed to generate PDF')
    } finally {
      setGeneratingPDF(false)
    }
  }

  // Fetch session and batches
  useEffect(() => {
    const fetchSessionData = async () => {
      if (!sessionId) {
        setError('Invalid session ID')
        setLoading(false)
        return
      }

      if (!supabase) {
        setError('Database not configured')
        setLoading(false)
        return
      }

      try {
        // Fetch session metadata
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select(
            `
            *,
            sites (site_name)
          `
          )
          .eq('visitor_id', sessionId)
          .single()

        if (sessionError || !sessionData) {
          setError('Session not found')
          setLoading(false)
          return
        }

        setSession(sessionData)

        // The URL param is the visitor_id, but event batches are keyed by the
        // real session_id (a different UUID). Load batch metadata for the table
        // display using the real session_id.
        const realSessionId = sessionData.session_id

        // Fetch the most recent form-submission screenshot for this session.
        const { data: screenshotData } = await supabase
          .from('screenshots')
          .select('screenshot_url, captured_at')
          .eq('session_id', realSessionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (screenshotData) setScreenshot(screenshotData)

        const { data: batchData } = await supabase
          .from('session_event_batches')
          .select('*')
          .eq('session_id', realSessionId)
          .order('batch_number', { ascending: true })
        if (batchData) setBatches(batchData)

        // The recordings bucket is private, so the browser anon client cannot
        // download batch files directly. Fetch the merged events from a server
        // route that uses the service role key (handles both the merged
        // events_file_url fast path and the per-batch fallback).
        const recordingRes = await fetch(
          `/api/sessions/recording/${encodeURIComponent(sessionId)}`,
        )

        if (!recordingRes.ok) {
          console.error('[v0] Failed to load recording:', recordingRes.status)
          setError('No recording available')
        } else {
          const payload = await recordingRes.json()
          const loadedEvents: RRWebEvent[] = Array.isArray(payload.events)
            ? payload.events
            : []
          if (loadedEvents.length === 0) {
            setError('No recording available')
          } else {
            setEvents(loadedEvents)
            setPlayerReady(true)
          }
        }
      } catch (err) {
        console.error('Error fetching session:', err)
        setError('Failed to load session data')
      } finally {
        setLoading(false)
      }
    }

    fetchSessionData()
  }, [supabase, sessionId])

  // Initialize rrweb-player
  useEffect(() => {
    if (!playerReady || events.length === 0) return

    // Dynamically load rrweb-player
    const loadRRWebPlayer = async () => {
      try {
        // Load CSS
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css'
        document.head.appendChild(link)

        // Add custom CSS for modern video player styling
        const customStyle = document.createElement('style')
        customStyle.textContent = `
          .rr-player {
            display: flex !important;
            flex-direction: column !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            border: 1px solid #e2e8f0 !important;
            background: white !important;
            width: 100% !important;
            height: 100% !important;
          }
          
          .rr-player__frame {
            border-radius: 12px 12px 0 0 !important;
            background: white !important;
            border-bottom: 1px solid #e2e8f0 !important;
            width: 100% !important;
            height: auto !important;
            flex: 1 1 auto !important;
            overflow: hidden !important;
            position: relative !important;
          }
          
          /* Force the replayer wrapper + iframe to fill the frame with no
             centering transforms or offsets that shrink the content. */
          .rr-player .replayer-wrapper {
            width: 100% !important;
            height: 100% !important;
            transform: none !important;
            top: 0 !important;
            left: 0 !important;
            position: relative !important;
          }
          
          .rr-player iframe {
            border-radius: 12px 12px 0 0 !important;
            background: white !important;
            width: 100% !important;
            height: 100% !important;
            transform: none !important;
            top: 0 !important;
            left: 0 !important;
            position: relative !important;
          }
          
          .rr-player .replayer-mouse,
          .rr-player .replayer-mouse-tail {
            position: absolute !important;
          }
          
          .rr-controller {
            background: #f8fafc !important;
            border-radius: 0 0 12px 12px !important;
            border: none !important;
            border-top: 1px solid #e2e8f0 !important;
            padding: 12px 16px !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }
          
          /* Timeline wrapper: holds the times + the seek bar, takes all free space */
          .rr-timeline {
            flex: 1 1 auto !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
          }
          
          /* Current time / total duration display, e.g. 00:27 / 01:23 */
          .rr-timeline__time {
            color: #475569 !important;
            font-family: ui-monospace, SFMono-Regular, monospace !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            min-width: 44px !important;
            text-align: center !important;
            white-space: nowrap !important;
          }
          
          /* The seek / progress bar — full width, colored fill + draggable handle */
          .rr-progress {
            flex: 1 1 auto !important;
            position: relative !important;
            height: 8px !important;
            background: #e2e8f0 !important;
            border-radius: 9999px !important;
            cursor: pointer !important;
            opacity: 1 !important;
          }
          
          .rr-progress.disabled {
            cursor: not-allowed !important;
          }
          
          /* Colored fill showing how far through the recording we are */
          .rr-progress__step {
            height: 100% !important;
            background: #3b82f6 !important;
            border-radius: 9999px !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
          }
          
          /* Draggable scrubbing handle (circle) */
          .rr-progress__handler {
            position: absolute !important;
            top: 50% !important;
            width: 14px !important;
            height: 14px !important;
            border-radius: 50% !important;
            background: #3b82f6 !important;
            border: 2px solid #ffffff !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25) !important;
            transform: translate(-50%, -50%) !important;
            cursor: grab !important;
          }
          
          .rr-progress__handler:active {
            cursor: grabbing !important;
          }
          
          .rr-controller__btns {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
          }
          
          .rr-controller__btns button {
            background: white !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
            padding: 8px 10px !important;
            color: #475569 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          
          .rr-controller__btns button:hover {
            background: #f1f5f9 !important;
            border-color: #cbd5e1 !important;
          }
          
          .rr-controller__btns button.active {
            background: #3b82f6 !important;
            border-color: #3b82f6 !important;
            color: #ffffff !important;
          }
          
          .rr-controller__btns button svg {
            width: 16px !important;
            height: 16px !important;
            fill: #475569 !important;
          }
          
          .rr-controller .switch {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            color: #64748b !important;
            font-size: 12px !important;
          }
          
          .rr-controller .switch input[type="checkbox"] {
            accent-color: #3b82f6 !important;
            width: 14px !important;
            height: 14px !important;
          }
          
          .rr-controller select {
            background: white !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
            color: #475569 !important;
            padding: 6px 10px !important;
            font-size: 12px !important;
            cursor: pointer !important;
          }
          
          .rr-controller select:hover {
            background: #f8fafc !important;
            border-color: #cbd5e1 !important;
          }
          
          .rr-controller select option {
            background: white !important;
            color: #475569 !important;
          }
          
          /* Force replayer wrapper and iframe to fill the container */
          .replayer-wrapper {
            width: 100% !important;
            height: 100% !important;
            transform: none !important;
          }
          
          .replayer-wrapper iframe {
            width: 100% !important;
            height: 100% !important;
            transform: none !important;
            position: relative !important;
          }
        `
        document.head.appendChild(customStyle)

        // Load JS
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js'
        script.async = true
      script.onload = async () => {
          // Initialize player
          const container = document.getElementById('rrweb-player')
          if (container && (window as any).rrwebPlayer) {
            // Clear any previous content
            container.innerHTML = ''
            const replayer = new (window as any).rrwebPlayer({
              target: container,
              props: {
                events,
                autoPlay: false,
                width: container.clientWidth || 800,
                height: 600,
                // Show plain text in input fields during replay
                maskAllInputs: false,
                maskInputOptions: {
                  password: false,
                  email: false,
                  text: false,
                  tel: false,
                  url: false,
                  number: false,
                  select: false,
                  textarea: false,
                },
                UNSAFE_replayCanvas: false,
              },
            })
            
            // Force the replayer wrapper to fill the container
            setTimeout(() => {
              const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement
              if (wrapper) {
                wrapper.style.width = '100%'
                wrapper.style.height = '100%'
                wrapper.style.transform = 'none'
                wrapper.style.top = '0'
                wrapper.style.left = '0'
                wrapper.style.position = 'relative'
              }
            }, 100)
          }
        }
        document.body.appendChild(script)
      } catch (err) {
        console.error('Error loading rrweb-player:', err)
        setError('Failed to load replay player')
      }
    }

    loadRRWebPlayer()
  }, [playerReady, events])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card className="p-6">
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{error}</h2>
          <Link href="/admin/sessions">
            <Button>Back to Sessions</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Session not found</h2>
          <Link href="/admin/sessions">
            <Button>Back to Sessions</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Session Replay</h1>
          <p className="text-slate-600 mt-2">{session.sites?.site_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 text-[14px] font-medium text-white bg-[#ef4444] border border-[#ef4444] rounded-lg min-w-[160px] hover:bg-[#dc2626] hover:border-[#dc2626] transition-colors"
          >
            <Trash2 size={16} />
            Delete Session
          </button>
          <Link href="/admin/sessions">
            <button className="inline-flex items-center justify-center gap-2 h-10 px-5 text-[14px] font-medium text-[#374151] bg-white border border-[#e2e8f0] rounded-lg min-w-[160px] hover:bg-[#f8fafc] transition-colors">
              <ArrowLeft size={16} />
              Back to Sessions
            </button>
          </Link>
        </div>
      </div>

      {/* Session Metadata Card */}
      <Card className="p-6">
        <div className="space-y-6">
          {/* Session ID with Copy */}
          <div>
            <label className="text-sm font-semibold text-slate-600">Session ID</label>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 p-3 bg-slate-100 rounded font-mono text-sm overflow-auto">
                {session.visitor_id}
              </code>
              <button
                onClick={() => copyToClipboard(session.visitor_id)}
                className="p-2 hover:bg-slate-100 rounded transition"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Site Name */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Site Name</label>
              <p className="mt-2 text-slate-900">{session.sites?.site_name || '-'}</p>
            </div>

            {/* Page URL */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Page URL</label>
              <a
                href={session.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-blue-600 hover:underline break-all"
              >
                {session.page_url}
              </a>
            </div>

            {/* IP Address */}
            <div>
              <label className="text-sm font-semibold text-slate-600">IP Address</label>
              <p className="mt-2 text-slate-900 font-mono">{session.ip_address || '-'}</p>
            </div>

            {/* Started At */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Started At</label>
              <p className="mt-2 text-slate-900">{formatDate(session.started_at)}</p>
            </div>

            {/* Submitted At */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Submitted At</label>
              <p className="mt-2 text-slate-900">{formatDate(session.submitted_at)}</p>
            </div>

            {/* Finalized At */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Finalized At</label>
              <p className="mt-2 text-slate-900">{formatDate(session.finalized_at)}</p>
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Status</label>
              <div className="mt-2">
                <Badge className={getStatusColor(session.status)}>
                  {getStatusLabel(session.status)}
                </Badge>
              </div>
            </div>

            {/* Event Count */}
            <div>
              <label className="text-sm font-semibold text-slate-600">Event Count</label>
              <p className="mt-2 text-slate-900">{session.event_count}</p>
            </div>
          </div>

          {/* User Agent */}
          <div>
            <label className="text-sm font-semibold text-slate-600">User Agent</label>
            <p className="mt-2 text-slate-900 text-sm break-all">{session.user_agent}</p>
          </div>
        </div>
      </Card>

      {/* Session Report Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Session Report</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={generatingPDF}
              className="inline-flex items-center gap-2 px-4 py-2 text-[14px] font-medium text-slate-700 bg-white border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye size={16} />
              {generatingPDF ? 'Generating...' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={generatingPDF}
              className="inline-flex items-center gap-2 px-4 py-2 text-[14px] font-medium text-white bg-[#2563eb] rounded-lg hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              {generatingPDF ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">Generate a PDF report containing session events data and session metadata for your records.</p>
      </Card>

      {/* Form Submission Screenshot */}
      {/* <Card className="p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Form Submission Screenshot</h2>
        {screenshot ? (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Captured at: {screenshot.captured_at ? new Date(screenshot.captured_at).toLocaleString() : 'Unknown'}
            </p>
            <img
              src={screenshot.screenshot_url || "/placeholder.svg"}
              alt="Screenshot of the form at submission time"
              className="w-full border border-slate-200"
              style={{ borderRadius: '8px' }}
            />
          </>
        ) : (
          <p className="text-sm text-slate-500 mt-2">No screenshot captured for this session</p>
        )}
      </Card> */}

      {/* Player Container */}
      {events.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Replay</h2>
          <div 
            id="rrweb-player" 
            className="border border-slate-200 rounded overflow-hidden"
            style={{ width: '100%', height: '70vh', minHeight: '500px', overflow: 'hidden', borderRadius: '8px', background: '#000' }}
          ></div>
        </Card>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-slate-600">No recording available</p>
        </Card>
      )}

      {/* Event Batches Table */}
      {batches.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Event Batches</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch Number</TableHead>
                  <TableHead>Event Count</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Storage Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono">{batch.batch_number}</TableCell>
                    <TableCell>{batch.event_count}</TableCell>
                    <TableCell>{formatDate(batch.created_at)}</TableCell>
                    <TableCell className="text-sm text-slate-600 break-all">
                      {batch.storage_path}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Delete confirmation modal */}
      <DeleteSessionDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        sessionLabel={session.visitor_id}
        onConfirm={handleDeleteSession}
      />
    </div>
  )
}
