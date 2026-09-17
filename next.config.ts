import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Fixa a raiz do projeto: sem isso o Turbopack pode escolher um lockfile de
  // um diretório acima (ex.: ~/yarn.lock) como raiz do workspace.
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  // Cabeçalhos de segurança em todas as respostas: impede o app de ser
  // embutido em iframe de outro site (clickjacking), bloqueia "adivinhação"
  // de tipo de arquivo e limita câmera/GPS ao próprio app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
