import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import RegistrarSW from '@/components/RegistrarSW'
import StatusConexao from '@/components/StatusConexao'

export const metadata: Metadata = {
  title: 'Território de Campo',
  description: 'Sistema de Gestão de Territórios',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Território de Campo' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#60C898',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Servidos localmente (public/vendor) em vez de CDN externo — mapa
            não depende mais de internet pra fora nem de unpkg estar no ar. */}
        <link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />
        <link rel="stylesheet" href="/vendor/leaflet-draw/leaflet.draw.css" />
      </head>
      <body suppressHydrationWarning>
        <StatusConexao />
        {children}
        <RegistrarSW />
        <Script src="/vendor/leaflet/leaflet.js" strategy="beforeInteractive" />
        <Script src="/vendor/leaflet-draw/leaflet.draw.js" strategy="beforeInteractive" />
      </body>
    </html>
  )
}