/** Check vendored whole-source hashes and compile excerpts against the pinned originals. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('provenance.json'));
const sha = text => createHash('sha256').update(text).digest('hex');
for (const [name, source] of Object.entries(manifest.files)) {
  assert.equal(sha(read(`upstream/${name}`)), source.sha256, `Upstream hash: ${name}`);
}
for (const venue of ['raydium_clmm', 'whirlpool', 'meteora_dlmm']) {
  const raw = read(`upstream/${venue}.rs`), utility = read(`upstream/utils_${venue}.rs`);
  const sections = [raw.slice(raw.indexOf('#[derive(Clone, Debug)]'), raw.indexOf('/// Instruction builder'))];
  if (venue === 'raydium_clmm') sections.push(raw.slice(raw.indexOf('fn clmm_sqrt_limit'), raw.indexOf('async fn build_clmm_swap')).replace('fn clmm_sqrt_limit', 'pub fn clmm_sqrt_limit'));
  sections.unshift(utility.split('\n').filter(line => (line.startsWith('pub const ') && line.includes('Pubkey')) || ['pub const SWAP', 'pub const MIN_SQRT', 'pub const MAX_SQRT'].some(prefix => line.startsWith(prefix))).join('\n') + '\n');
  for (const fn of { raydium_clmm: ['tick_array_bitmap_extension'], whirlpool: ['default_sqrt_price_limit', 'oracle'], meteora_dlmm: [] }[venue]) {
    const start = utility.indexOf(`pub fn ${fn}(`);
    let end = utility.indexOf('{', start) + 1, depth = 1;
    while (depth) { depth += Number(utility[end] === '{') - Number(utility[end] === '}'); end++; }
    sections.splice(1, 0, utility.slice(start, end) + '\n');
  }
  const expected = ('// Extracted from pinned upstream; see provenance.json and verify-source.mjs.\nuse anyhow::{anyhow, Result};\nuse solana_sdk::{pubkey, pubkey::Pubkey, instruction::{AccountMeta, Instruction}};\n\n' + sections.join('\n')).trimEnd() + '\n';
  assert.equal(read(`src/${venue}.rs`), expected, `Unmodified upstream logic: ${venue}`);
  assert.equal(sha(expected), manifest.excerpts[`${venue}.rs`]);
}
export default manifest;
