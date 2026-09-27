/** Transport-free provider metadata for credential settings UIs. */
export { SwqosType } from './enums';
export { MAX_HTTP_SENDER_ROUTES } from './swqos/metadata';
export * from './swqos/http-settings';

import bs58 from 'bs58';
/** Validates a canonical 32-byte Solana address without loading RPC clients. */
export function isSenderTipAddress(value: string): boolean {
  try {
    return value.length >= 32 && value.length <= 44 && bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}
