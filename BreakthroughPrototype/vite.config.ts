import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/breakthrough-prototype/',
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,   // permit tunnel hostnames (localtunnel, ngrok, etc.)
  },
})
