// Family Hub service worker -- hand-written, no build plugin.
// Pages: network first, fall back to the cached app shell (works offline).
// /assets/*: content-hashed by vite, so cache first, forever.
// GET /api/*: network first, fall back to the last answer (read-only offline).
// Writes (POST) are never cached -- offline they fail and the app shows its error.
// Bump VERSION to drop every old cache on the next visit.
// Paths are relative to where the worker lives: '/' on the NAS,
// '/family-hub-app/' on GitHub Pages.
const VERSION = 'v2'
const CACHE = `family-hub-${VERSION}`
const BASE = new URL('./', self.location).pathname
const SHELL = [
  '', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'manifest-coffee.json', 'icons/coffee/icon-192.png', 'icons/coffee/icon-512.png', // the coffee app
].map((p) => BASE + p)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(fallbackUrl ?? request)
    if (cached) return cached
    throw err
  }
}

// Pages: network first; offline, the last copy of this app's page, else the family shell.
// /coffee has its own key so its page (coffee.html on Pages) never replaces the family shell.
async function navigate(request, key) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(key, response.clone())
    return response
  } catch (err) {
    const cached = (await cache.match(key)) ?? (await cache.match(BASE))
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Every route (/, /recipes, /attractions...) is the same index.html; /coffee is the coffee app's copy.
  const key = url.pathname.startsWith(BASE + 'coffee') ? BASE + 'coffee' : BASE
  if (request.mode === 'navigate') return event.respondWith(navigate(request, key))
  if (url.pathname.startsWith(BASE + 'api/')) return event.respondWith(networkFirst(request))
  if (url.pathname.startsWith(BASE + 'assets/')) return event.respondWith(cacheFirst(request))
})
