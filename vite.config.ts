import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { publicMetadataTags } from './src/config/publicMetadata'

export default defineConfig({
  build: { manifest: true },
  plugins: [
    react(),
    tailwindcss(),
    { name: 'na-public-metadata', transformIndexHtml: () => publicMetadataTags() },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      ignored: ['**/backend/**'],
    },
    proxy: {
      '/api': {
        target: process.env.NABARBEARIA_API_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
