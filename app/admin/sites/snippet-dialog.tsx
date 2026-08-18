'use client'

import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Copy, Check, X } from 'lucide-react'
import { useState } from 'react'

interface SnippetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: {
    id: string
    site_name: string
    site_key: string
  }
}

export function SnippetDialog({
  open,
  onOpenChange,
  site,
}: SnippetDialogProps) {
  const [copied, setCopied] = useState(false)

  const snippet = `<script src="https://v0-consentvault-app-shell-eight.vercel.app/recorder.js" data-site-key="${site.site_key}" async></script>`

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      toast.success('Snippet copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 99,
        }}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal wrapper - perfectly centered */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          width: '90%',
          maxWidth: '520px',
          background: 'white',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Row 1: Title + Close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              margin: 0,
              color: '#1e293b',
            }}
          >
            Installation Snippet
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Row 2: Dark code block with natural text wrapping */}
        <div
          style={{
            background: '#1e293b',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <pre
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '13px',
              color: '#e2e8f0',
              margin: 0,
              overflow: 'hidden',
              whiteSpace: 'normal',
              wordBreak: 'break-all',
              lineHeight: '1.5',
            }}
          >
            <code>{snippet}</code>
          </pre>
        </div>

        {/* Row 3: Muted note text */}
        <p
          style={{
            fontSize: '12px',
            color: '#64748b',
            margin: '0 0 20px 0',
            lineHeight: '1.5',
          }}
        >
          <strong>Note:</strong> Replace{' '}
          <code
            style={{
              background: '#f1f5f9',
              color: '#1e293b',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '11px',
            }}
          >
            your-consentvault-domain.com
          </code>{' '}
          with your actual domain.
        </p>

        {/* Row 4: Copy button (right-aligned) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            onClick={handleCopySnippet}
            style={{
              background: copied ? '#10b981' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s ease',
            }}
          >
            {copied ? (
              <>
                <Check size={16} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} />
                Copy Code
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
