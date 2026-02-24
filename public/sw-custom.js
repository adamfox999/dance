self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const action = event.action
  const targetUrl = notification?.data?.url || '/'

  notification?.close()

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of windowClients) {
      if ('focus' in client) {
        await client.focus()
      }
      if ('navigate' in client) {
        await client.navigate(targetUrl)
      }
      return
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})
