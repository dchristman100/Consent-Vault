'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface DeleteSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The site name shown to the user in the code block */
  siteLabel: string
  /** Async handler that performs the actual delete. Should throw on failure. */
  onConfirm: () => Promise<void>
}

export function DeleteSiteDialog({
  open,
  onOpenChange,
  siteLabel,
  onConfirm,
}: DeleteSiteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  if (!open) return null

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

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
        onClick={() => !deleting && onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal wrapper - centered */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          width: '90%',
          maxWidth: '420px',
          background: 'white',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          textAlign: 'center',
        }}
      >
        {/* Warning icon */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '9999px',
              background: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={28} color="#ef4444" />
          </div>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: '0 0 8px 0',
            color: '#1e293b',
          }}
        >
          Delete Site?
        </h2>

        {/* Body text */}
        <p
          style={{
            fontSize: '14px',
            color: '#64748b',
            lineHeight: 1.5,
            margin: '0 0 16px 0',
          }}
        >
          Are you sure you want to delete this site? This will permanently remove
          the site and all its associated data including sessions and recordings.
          This action cannot be undone.
        </p>

        {/* Site name code block */}
        <div
          style={{
            background: '#f1f5f9',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '24px',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: '12px',
            color: '#475569',
            wordBreak: 'break-all',
          }}
        >
          {siteLabel}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
          }}
        >
          <button
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            style={{
              flex: 1,
              background: 'white',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              flex: 1,
              background: deleting ? '#fca5a5' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: deleting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!deleting) e.currentTarget.style.background = '#dc2626'
            }}
            onMouseLeave={(e) => {
              if (!deleting) e.currentTarget.style.background = '#ef4444'
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}
