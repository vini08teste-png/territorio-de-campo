import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Fixa a raiz do projeto: sem isso o Turbopack pode escolher um lockfile de
  // um diretório acima (ex.: ~/yarn.lock) como raiz do workspace.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
