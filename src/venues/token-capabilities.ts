/** Mint capabilities for ordinary, public-balance transfers in raw base units. */
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import { AccountState, ExtensionType, getDefaultAccountState, getPausableConfig, getTransferFeeConfig, getTransferHook, getTypeLen, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, type Mint } from '@solana/spl-token';

export type TokenMint = Mint & { tokenProgram: PublicKey };
export interface TokenCapabilityPolicy {
  venue: string;
  transferFee: boolean;
  /** Conditional support requires caller-resolved hook accounts when building. */
  transferHook: 'reject' | 'resolved-accounts';
}
export interface TokenCapabilities {
  transferFee: boolean;
  transferHookProgram: PublicKey | null;
}

/** SPL TokenMetadata: two pubkeys, three Borsh strings, then a vector of string pairs. */
function validateMetadata(data: Buffer, expectedMint: PublicKey, fail: (message: string) => never): void {
  if (data.length < 80) fail('Malformed TokenMetadata payload');
  const mintBytes = expectedMint.toBytes();
  if (!data.subarray(32, 64).every((byte, index) => byte === mintBytes[index])) fail('TokenMetadata mint does not match pool');
  let offset = 64;
  const u32 = () => {
    if (offset + 4 > data.length) fail('Malformed TokenMetadata length');
    const value = data.readUInt32LE(offset); offset += 4; return value;
  };
  const string = () => {
    const length = u32();
    if (length > data.length - offset) fail('Malformed TokenMetadata string');
    const bytes = data.subarray(offset, offset + length);
    const encoded = Buffer.from(bytes.toString('utf8'), 'utf8');
    if (encoded.length !== bytes.length || !encoded.every((byte, index) => byte === bytes[index])) fail('Malformed TokenMetadata UTF-8');
    offset += length;
  };
  string(); string(); string();
  const count = u32();
  // Each pair needs at least two length prefixes. Bound before looping untrusted counts.
  if (count > Math.floor((data.length - offset) / 8)) fail('Malformed TokenMetadata entries');
  for (let index = 0; index < count; index++) { string(); string(); }
  if (offset !== data.length) fail('Malformed TokenMetadata trailing bytes');
}

/**
 * Recheck at prepare, quote and build, including trusted cached snapshots. This checks
 * mint features; callers still provide usable, unfrozen public-balance token accounts.
 * Authority/metadata/UI extensions do not change raw transfer amounts. A confidential
 * mint configuration is permitted for ordinary public transfers only: confidential
 * instructions/balances/proofs are not supported. Mutable authority state can change
 * after preparation; successful quotes do not guarantee future transfers will succeed.
 */
export function assertTokenCapabilities(mint: TokenMint, expectedMint: PublicKey, policy: TokenCapabilityPolicy): TokenCapabilities {
  const fail = (message: string): never => { throw new Error(`${policy.venue}: ${message}`); };
  if (!mint || !mint.address?.equals(expectedMint)) fail('Mint address does not match pool');
  if (!mint.isInitialized) fail('Mint is not initialized');
  if (!mint.tokenProgram?.equals(TOKEN_PROGRAM_ID) && !mint.tokenProgram?.equals(TOKEN_2022_PROGRAM_ID)) fail('Unsupported token program');
  if (!mint.tlvData) fail('Missing mint extension data');
  if (mint.tokenProgram.equals(TOKEN_PROGRAM_ID) && mint.tlvData.length !== 0) fail('Legacy token program cannot contain extensions');
  const seen = new Set<number>();
  for (let offset = 0; offset < mint.tlvData.length;) {
    // SPL accounts may have unused zero-filled padding after the last TLV entry.
    if (mint.tlvData.subarray(offset).every(byte => byte === 0)) break;
    if (offset + 4 > mint.tlvData.length) fail('Malformed mint extension header');
    const type = mint.tlvData.readUInt16LE(offset);
    const length = mint.tlvData.readUInt16LE(offset + 2);
    if (offset + 4 + length > mint.tlvData.length) fail('Malformed mint extension length');
    if (seen.has(type)) fail(`Duplicate mint extension ${type}`);
    seen.add(type);
    switch (type) {
      // These features leave ordinary public token transfer amounts unchanged.
      case ExtensionType.MintCloseAuthority:
      case ExtensionType.PermanentDelegate:
      case ExtensionType.ConfidentialTransferMint:
      case ExtensionType.InterestBearingConfig:
      case ExtensionType.ScaledUiAmountConfig:
      case ExtensionType.MetadataPointer:
      case ExtensionType.TokenMetadata:
      case ExtensionType.GroupPointer:
      case ExtensionType.TokenGroup:
      case ExtensionType.GroupMemberPointer:
      case ExtensionType.TokenGroupMember:
      case ExtensionType.DefaultAccountState:
      case ExtensionType.PausableConfig:
      case ExtensionType.TransferHook:
        break;
      case ExtensionType.TransferFeeConfig:
        if (!policy.transferFee) fail('Transfer-fee mints are unsupported');
        break;
      default:
        fail(`Unsupported mint extension ${ExtensionType[type] ?? type}`);
    }
    if (type === ExtensionType.TokenMetadata) validateMetadata(mint.tlvData.subarray(offset + 4, offset + 4 + length), expectedMint, fail);
    if (type !== ExtensionType.TokenMetadata && length !== getTypeLen(type)) fail(`Invalid mint extension length for ${ExtensionType[type] ?? type}`);
    offset += 4 + length;
  }
  const defaultState = getDefaultAccountState(mint);
  if (defaultState && defaultState.state !== AccountState.Initialized) fail('Unsupported default account state');
  if (getPausableConfig(mint)?.paused) fail('Token mint is paused');
  const fee = getTransferFeeConfig(mint);
  if (fee && [fee.olderTransferFee, fee.newerTransferFee].some(value => value.transferFeeBasisPoints > 10000)) fail('Invalid transfer-fee basis points');
  const hook = getTransferHook(mint);
  const transferHookProgram = hook && !hook.programId.equals(PublicKey.default) ? hook.programId : null;
  if (transferHookProgram && policy.transferHook === 'reject') fail('Active transfer-hook mints are unsupported');
  return { transferFee: fee !== null, transferHookProgram };
}
