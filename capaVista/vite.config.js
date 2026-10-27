import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { localAccess, localOrigin, localPort } from './dev/localAccess.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localAccess()],
  server: {
    host: '127.0.0.1',
    port: localPort,
    strictPort: true,
    origin: localOrigin,
    cors: { origin: localOrigin },
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: localPort,
    strictPort: true,
    cors: { origin: localOrigin },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
