import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Next no es dependencia del SDK: los tests del subpath /next usan un stub.
    alias: {
      'next/cache': fileURLToPath(
        new URL('./test/stubs/next-cache.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
