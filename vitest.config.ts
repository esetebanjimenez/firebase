import { defineConfig } from 'vitest/config';

// The simulation core is plain TypeScript (no JSX/DOM), so tests run in a Node
// environment with no plugins. Keeping this separate from vite.config.ts avoids
// Vitest's bundled Vite types clashing with the app's Vite.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
