import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    watch: false,
    deps: {
      interopDefault: true, // Ensures ESM compatibility
    },
    include: ['src/**/*.test.ts'],
  },
});
