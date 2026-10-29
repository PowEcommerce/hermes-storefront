import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('tipos generados', () => {
  it('src/generated/schema.d.ts está al día con openapi.yaml', () => {
    const script = join(
      dirname(fileURLToPath(import.meta.url)),
      '../scripts/check-generated.mjs',
    );
    expect(() =>
      execFileSync(process.execPath, [script], { stdio: 'pipe' }),
    ).not.toThrow();
  }, 30_000);
});
