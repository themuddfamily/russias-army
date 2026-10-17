import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    // Long virtual-world catch-up fixtures each query the full source scene.
    // Run them serially so competing workers cannot consume their deadlines.
    maxWorkers: 1,
  },
});
