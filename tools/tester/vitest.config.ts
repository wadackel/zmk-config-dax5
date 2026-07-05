import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}'],
  },
})
