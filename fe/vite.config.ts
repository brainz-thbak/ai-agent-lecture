import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxy = {
  '/api': {
    target: process.env.DEMO_API_URL ?? 'http://localhost:8080',
    rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, ''),
  },
}

const server = { host: '0.0.0.0', port: 3000, strictPort: true, proxy }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server,
  preview: server,
})
