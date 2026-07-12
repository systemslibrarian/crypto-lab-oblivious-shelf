/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/crypto-lab-oblivious-shelf/',
  test: {
    // Unit tests live beside the source in src/. The Playwright a11y suite in
    // e2e/ is driven by `npm run test:a11y`, never by vitest — keep them apart.
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
})
