import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/sekigae-5.5/' : '/'),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
