'use client'

export default function PrintButton() {
  return (
    <button type="button" className="sx-btn ghost small" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  )
}
