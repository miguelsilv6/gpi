import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/components/theme-provider'
import { BrandProvider } from '@/components/brand-provider'
import { getBrand, brandAssetUrl } from '@/lib/brand'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand()
  // When a custom favicon is stored, point the <link rel="icon"> at the
  // cache-busted /branding/<file>?v=<ts> URL so the browser picks up the
  // new icon immediately after the admin uploads one. Without this, the
  // auto-discovered icon.tsx serves /icon with no version query, and
  // browsers cache it indefinitely.
  const faviconUrl = b.faviconFilename
    ? brandAssetUrl(b.faviconFilename, b.brandUpdatedAt)
    : null
  return {
    title: { default: `${b.appName} — ${b.appDescription}`, template: `%s · ${b.appName}` },
    description: b.manifestDescription,
    manifest: '/manifest.webmanifest',
    ...(faviconUrl && { icons: { icon: faviconUrl } }),
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: b.appShortName,
    },
  }
}

// MOBILE-A11Y: deliberadamente sem cap de zoom — utilizadores com baixa
// visão têm de poder fazer pinch-zoom. WCAG 2.1 / 1.4.4. Ver
// tests/unit/mobile-a11y.test.ts que protege esta decisão.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await getBrand()
  return (
    <html lang="pt" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionProvider>
            <BrandProvider value={brand}>
              <TooltipProvider>
                {children}
                <Toaster richColors position="top-right" />
              </TooltipProvider>
            </BrandProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
