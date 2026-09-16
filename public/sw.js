/* Service worker do Território de Campo — feito à mão (sem next-pwa, que não
   funciona no Next 16 + Turbopack). Cacheia o "casco" do app pra instalar e
   abrir offline, e faz cache em tempo real das leituras (GET) do Supabase, das
   fotos e dos tiles do mapa conforme o usuário navega — assim dá pra consultar
   territórios/quadras já visitados sem sinal. NÃO cacheia escrita (POST/PATCH/
   DELETE) nem login — isso continua exigindo internet (a fila offline de
   marcações fica pra uma fase futura). */

// Bump this string pra invalidar caches antigos num deploy novo.
const VERSAO = 'tc-v1'
const CACHE_CASCO = `${VERSAO}-casco`
const CACHE_ESTATICO = `${VERSAO}-estatico`
const CACHE_DADOS = `${VERSAO}-dados`
const CACHE_STORAGE = `${VERSAO}-storage`
const CACHE_TILES = `${VERSAO}-tiles`

const CACHES_ATUAIS = [CACHE_CASCO, CACHE_ESTATICO, CACHE_DADOS, CACHE_STORAGE, CACHE_TILES]

// Essencial pra abrir o app offline. Cada item é cacheado à parte pra uma
// falha isolada não abortar a instalação inteira.
const CASCO = [
  '/',
  '/app',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet-draw/leaflet.draw.css',
  '/vendor/leaflet-draw/leaflet.draw.js',
]

const MAX_TILES = 800 // teto pra não estourar o armazenamento com tiles do mapa

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_CASCO)
    await Promise.all(CASCO.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })) } catch { /* ignora item que falhou */ }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys()
    await Promise.all(nomes.map((n) => (CACHES_ATUAIS.includes(n) ? null : caches.delete(n))))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (evento) => {
  const dado = evento.data
  if (dado === 'PULAR_ESPERA') { self.skipWaiting(); return }
  // Chamado no logout: limpa dados/fotos pra o próximo usuário não ver cache
  // do anterior offline. Casco/estático/tiles são neutros, ficam.
  if (dado === 'LIMPAR_DADOS') {
    evento.waitUntil(Promise.all([caches.delete(CACHE_DADOS), caches.delete(CACHE_STORAGE)]))
  }
})

// ── Estratégias ──────────────────────────────────────────────────────────────
async function networkFirst(request, nomeCache, fallbackCasco) {
  const cache = await caches.open(nomeCache)
  try {
    const resposta = await fetch(request)
    if (resposta && resposta.ok) cache.put(request, resposta.clone())
    return resposta
  } catch (e) {
    const salvo = await cache.match(request)
    if (salvo) return salvo
    if (fallbackCasco) {
      const casco = await caches.open(CACHE_CASCO)
      const alt = await casco.match(fallbackCasco)
      if (alt) return alt
    }
    throw e
  }
}

async function staleWhileRevalidate(request, nomeCache) {
  const cache = await caches.open(nomeCache)
  const salvo = await cache.match(request)
  const rede = fetch(request).then((resposta) => {
    if (resposta && (resposta.ok || resposta.type === 'opaque')) cache.put(request, resposta.clone())
    return resposta
  }).catch(() => null)
  return salvo || (await rede) || fetch(request)
}

async function cacheFirst(request, nomeCache, teto) {
  const cache = await caches.open(nomeCache)
  const salvo = await cache.match(request)
  if (salvo) return salvo
  const resposta = await fetch(request)
  if (resposta && (resposta.ok || resposta.type === 'opaque')) {
    cache.put(request, resposta.clone())
    if (teto) limitarCache(nomeCache, teto)
  }
  return resposta
}

async function limitarCache(nomeCache, teto) {
  const cache = await caches.open(nomeCache)
  const chaves = await cache.keys()
  if (chaves.length <= teto) return
  // Remove as mais antigas (ordem de inserção) até voltar ao teto.
  for (let i = 0; i < chaves.length - teto; i++) await cache.delete(chaves[i])
}

self.addEventListener('fetch', (evento) => {
  const request = evento.request
  if (request.method !== 'GET') return // escrita/login: sempre rede, não intercepta

  let url
  try { url = new URL(request.url) } catch { return }
  const host = url.hostname
  const path = url.pathname

  // Navegações (abrir uma página) → rede primeiro, cai pro que já foi salvo.
  if (request.mode === 'navigate') {
    evento.respondWith(networkFirst(request, CACHE_CASCO, url.pathname.startsWith('/app') ? '/app' : '/'))
    return
  }

  // Supabase Auth → sempre rede, nunca cacheia (token/sessão).
  if (host.endsWith('supabase.co') && path.startsWith('/auth/')) return

  // Supabase Storage (fotos do marco / ponto) → cache primeiro (quase imutável).
  if (host.endsWith('supabase.co') && path.startsWith('/storage/v1/object/public/')) {
    evento.respondWith(cacheFirst(request, CACHE_STORAGE, 300))
    return
  }

  // Supabase REST (leitura de dados) → rede primeiro, cai pro salvo offline.
  if (host.endsWith('supabase.co') && path.startsWith('/rest/v1/')) {
    evento.respondWith(networkFirst(request, CACHE_DADOS))
    return
  }

  // Tiles do mapa (OpenStreetMap e afins) → cache primeiro, com teto.
  if (host.includes('tile.openstreetmap.org') || host.includes('tile.opentopomap.org') || /(^|\.)basemaps\./.test(host)) {
    evento.respondWith(cacheFirst(request, CACHE_TILES, MAX_TILES))
    return
  }

  // Estáticos do próprio app (chunks do Next, vendor, imagens, css) → SWR.
  if (url.origin === self.location.origin) {
    if (
      path.startsWith('/_next/') || path.startsWith('/vendor/') || path.startsWith('/cadastro-2015/') ||
      /\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|ttf|json)$/.test(path)
    ) {
      evento.respondWith(staleWhileRevalidate(request, CACHE_ESTATICO))
      return
    }
  }

  // Resto: deixa a rede cuidar (sem interceptar).
})
