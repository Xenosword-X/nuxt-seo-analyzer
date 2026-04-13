// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
