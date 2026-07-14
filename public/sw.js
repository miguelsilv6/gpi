/*
 * Service worker do GPI.
 *
 * Âmbito nesta versão: Web Push (mostrar notificações) + foco/deep-link no
 * clique. NÃO faz cache de dados offline — os dados de inquérito são sensíveis
 * e não devem ficar em repouso no dispositivo. Mantém-se propositadamente
 * minimalista para não interferir com o carregamento normal da app.
 */

self.addEventListener('install', () => {
  // Ativa esta versão imediatamente, sem esperar que as abas antigas fechem.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'GPI', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'GPI'
  const options = {
    body: data.body || '',
    icon: '/branding-defaults/logo-light.svg',
    badge: '/branding-defaults/logo-light.svg',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // Defesa em profundidade contra open-redirect: só navegamos para caminhos da
  // mesma origem. Os payloads são gerados no servidor (URLs relativas), mas
  // validamos na mesma antes de abrir/navegar.
  let targetUrl = '/'
  try {
    const raw = event.notification.data && event.notification.data.url
    if (raw) {
      const parsed = new URL(raw, self.location.origin)
      if (parsed.origin === self.location.origin) {
        targetUrl = parsed.pathname + parsed.search + parsed.hash
      }
    }
  } catch (e) {
    targetUrl = '/'
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reutiliza uma janela já aberta da app, se existir.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if (targetUrl !== '/' && 'navigate' in client) {
            client.navigate(targetUrl).catch(() => {})
          }
          return undefined
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      return undefined
    }),
  )
})
