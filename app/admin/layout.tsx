import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch the currently logged-in user to show their name in the navbar.
  const supabase = await createClient()
  let displayName = 'Admin'
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    displayName = user?.email?.split('@')[0] || 'Admin'
  }
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex-1"></div>
          <div className="flex items-center gap-4">
            {/* User Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">{initial}</span>
              </div>
              <span className="text-sm font-medium text-slate-900 capitalize">{displayName}</span>
            </div>
          </div>
        </header>
        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
