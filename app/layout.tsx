import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Território de Campo',
  description: 'Sistema de Gestão de Territórios',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Território de Campo' },
}

export const viewport: Viewport = {
  themeColor: '#60C898',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Servidos localmente (public/vendor) em vez de CDN externo — mapa
            não depende mais de internet pra fora nem de unpkg estar no ar. */}
        <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
        <link rel="stylesheet" href="/vendor/leaflet-draw/leaflet.draw.css" />
      </head>
      <body>
        {children}
        <Script src="/vendor/leaflet/leaflet.js" strategy="beforeInteractive" />
        <Script src="/vendor/leaflet-draw/leaflet.draw.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}