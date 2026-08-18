import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'ConsentVault',
  description: 'Consent management and audit trail platform',
  icons: {
    icon: [
      { url: '/vault-favicon.png' },
      { url: '/vault-favicon.png', sizes: '16x16', type: 'image/png' },
      { url: '/vault-favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
