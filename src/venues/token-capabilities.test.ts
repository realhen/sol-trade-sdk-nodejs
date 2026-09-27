import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { AccountState, ExtensionType, getTypeLen, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TransferHookLayout, type Mint } from '@solana/spl-token';
import { assertTokenCapabilities, type TokenMint } from './token-capabilities';
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const policy = { venue: 'test', transferFee: true, transferHook: 'reject' as const };
function tlv(type: ExtensionType, data = Buffer.alloc(getTypeLen(type))) {
 const header = Buffer.alloc(4); header.writeUInt16LE(type); header.writeUInt16LE(data.length, 2); return Buffer.concat([header, data]);
}
function mint(tlvData: Buffer, tokenProgram = TOKEN_2022_PROGRAM_ID): TokenMint {
 return { address: key(1), isInitialized: true, decimals: 6, supply: 1000000n, mintAuthority: null, freezeAuthority: null, tlvData, tokenProgram } satisfies Mint & { tokenProgram: PublicKey };
}
describe('public raw-unit token extension capabilities', () => {
 it('accepts the xStocks feature combination only in its public-transfer-compatible state', () => {
  const xstock = mint(Buffer.concat([
   tlv(ExtensionType.MetadataPointer), tlv(ExtensionType.PermanentDelegate),
   tlv(ExtensionType.DefaultAccountState, Buffer.from([AccountState.Initialized])),
   tlv(ExtensionType.ScaledUiAmountConfig), tlv(ExtensionType.PausableConfig),
   tlv(ExtensionType.ConfidentialTransferMint), tlv(ExtensionType.TransferHook),
  ]));
  expect(assertTokenCapabilities(xstock, key(1), policy)).toEqual({ transferFee: false, transferHookProgram: null });
 });
 it.each([ExtensionType.NonTransferable, ExtensionType.CpiGuard, ExtensionType.TransferFeeAmount, 65535])('rejects unsupported/unknown mint extension %s', type => {
  expect(() => assertTokenCapabilities(mint(tlv(type, Buffer.alloc(0))), key(1), policy)).toThrow(/unsupported|length/i);
 });
 it('rejects a paused mint and default-frozen token accounts', () => {
  const paused = Buffer.alloc(getTypeLen(ExtensionType.PausableConfig)); paused[32] = 1;
  expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.PausableConfig, paused)), key(1), policy)).toThrow(/paused/i);
  expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.DefaultAccountState, Buffer.from([AccountState.Frozen]))), key(1), policy)).toThrow(/default.*state/i);
 });
 it('permits active transfer hooks only as explicitly conditional support', () => {
  const data = Buffer.alloc(TransferHookLayout.span); TransferHookLayout.encode({ authority: key(2), programId: key(3) }, data);
  const hooked = mint(tlv(ExtensionType.TransferHook, data));
  expect(() => assertTokenCapabilities(hooked, key(1), policy)).toThrow(/transfer.hook/i);
  expect(assertTokenCapabilities(hooked, key(1), { ...policy, transferHook: 'resolved-accounts' }).transferHookProgram).toEqual(key(3));
 });
 it('enforces program, initialization, address, extension length and policy at cached boundaries', () => {
  expect(() => assertTokenCapabilities(mint(Buffer.alloc(0), key(9)), key(1), policy)).toThrow(/program/i);
  expect(() => assertTokenCapabilities(mint(Buffer.alloc(0)), key(9), policy)).toThrow(/mint.*match/i);
  expect(() => assertTokenCapabilities({ ...mint(Buffer.alloc(0)), isInitialized: false }, key(1), policy)).toThrow(/initialized/i);
  expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.MetadataPointer), TOKEN_PROGRAM_ID), key(1), policy)).toThrow(/legacy|program/i);
  expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TransferFeeConfig, Buffer.alloc(1))), key(1), policy)).toThrow(/length|malformed/i);
  expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TransferFeeConfig)), key(1), { ...policy, transferFee: false })).toThrow(/transfer.fee/i);
  expect(() => assertTokenCapabilities(mint(Buffer.concat([tlv(ExtensionType.MetadataPointer), tlv(ExtensionType.MetadataPointer)])), key(1), policy)).toThrow(/duplicate/i);
 });
});
it('validates the complete variable-length TokenMetadata payload and embedded mint', () => {
 const string = (value: string) => { const data = Buffer.from(value); const length = Buffer.alloc(4); length.writeUInt32LE(data.length); return Buffer.concat([length, data]); };
 const count = Buffer.alloc(4); count.writeUInt32LE(1);
 const payload = Buffer.concat([key(2).toBuffer(), key(1).toBuffer(), string('xStock'), string('X'), string('https://example.test/token.json'), count, string('issuer'), string('example')]);
 expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TokenMetadata, payload)), key(1), policy)).not.toThrow();
 for (const size of [0, 1, 64, 79, payload.length - 1]) expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TokenMetadata, payload.subarray(0, size))), key(1), policy)).toThrow(/metadata/i);
 expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TokenMetadata, Buffer.concat([payload, Buffer.from([0])]))), key(1), policy)).toThrow(/metadata/i);
 const malformed = Buffer.from(payload); malformed.writeUInt32LE(0xffffffff, 64);
 expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TokenMetadata, malformed)), key(1), policy)).toThrow(/metadata/i);
 const foreignMint = Buffer.from(payload); key(9).toBuffer().copy(foreignMint, 32);
 expect(() => assertTokenCapabilities(mint(tlv(ExtensionType.TokenMetadata, foreignMint)), key(1), policy)).toThrow(/metadata/i);
});
it('accepts the actual Meta xStock TokenMetadata payload from the cloned mint', () => {
 const address = new PublicKey('Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu');
 const payload = Buffer.from('Q/nx7i43uAfqRct05gCXIr7ACSlgJuTkVYtDXiSl6cYH6Jq+tMctIVA39cVpA5pH1F22bh4GuPGBDz5nQY9BpAsAAABNZXRhIHhTdG9jawUAAABNRVRBeEQAAABodHRwczovL3hzdG9ja3MtbWV0YWRhdGEuYmFja2VkLmZpL3Rva2Vucy9Tb2xhbmEvTUVUQXgvbWV0YWRhdGEuanNvbgAAAAA=', 'base64');
 expect(() => assertTokenCapabilities({ ...mint(tlv(ExtensionType.TokenMetadata, payload)), address }, address, policy)).not.toThrow();
});
