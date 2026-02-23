import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import './index.css'

// Version check: clear service worker cache on new build, but preserve auth session
const handleVersionCheck = async () => {
  if (import.meta.env.DEV) return
  const currentBuild = import.meta.env.VITE_APP_BUILD
  if (!currentBuild) return
  const storedBuild = localStorage.getItem('app_build_version')

  if (storedBuild && storedBuild !== currentBuild) {
    // Build version changed — clear service worker cache
    console.log('New build detected, clearing service worker cache...')
    
    const registrations = await navigator.serviceWorker.getRegistrations()
    for (const reg of registrations) {
      await reg.unregister()
    }
    
    // Clear caches
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(name => caches.delete(name)))

    // Persist the new build before reloading to avoid repeat reload loops
    localStorage.setItem('app_build_version', currentBuild)
    
    // Reload to fresh state (auth session preserved in localStorage)
    window.location.reload()
    return
  }

  // Store current build version
  localStorage.setItem('app_build_version', currentBuild)
}

handleVersionCheck()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
)
