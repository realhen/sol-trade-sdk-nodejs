import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/venues/index.ts'], outfile: 'dist/venues/browser.mjs',
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  inject: ['scripts/browser-globals.ts'], define: { 'process.env.ANCHOR_BROWSER': 'true' },
  sourcemap: true, minify: true,
});
await copyFile('dist/venues/index.d.mts', 'dist/venues/browser.d.mts');
