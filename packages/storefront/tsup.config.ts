import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/next.ts', 'src/content.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  platform: 'neutral',
  // `next` es peerDependency opcional: nunca se empaqueta.
  external: ['node:crypto', 'next', 'next/cache'],
});
