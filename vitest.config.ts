import { defineConfig } from 'vitest/config';

export default defineConfig({
  // DLMM's published ESM imports an Anchor directory; Vite resolves it when inlined.
  test: { server: { deps: { inline: ['@meteora-ag/dlmm'] } } },
});
