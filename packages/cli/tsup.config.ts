import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node18',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
});
