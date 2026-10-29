import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/template.ts'],
  format: ['esm'],
  clean: true,
  target: 'node18',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
});
