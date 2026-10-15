export function BrandBar({ note }: { note?: string }) {
  return (
    <header className="sx-bar">
      <div className="sx-bar-in">
        <span className="sx-mark" aria-label="ShiFt">Shi<span className="f">F</span>t</span>
        {note ? <span className="sx-bar-note">{note}</span> : null}
      </div>
    </header>
  )
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="sx">
      <BrandBar />
      <main className="sx-main">
        <div className="sx-card">
          <h2>{title}</h2>
          <div className="sub" style={{ marginBottom: 0 }}>{children}</div>
        </div>
      </main>
    </div>
  )
}
