import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本番は FastAPI が frontend/dist を配信。開発時は /api を 8000 へプロキシ。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
