import { SwqosType, SwqosRegion } from '../enums';
import * as metadata from './metadata';

/** Browser-compatible providers. Other SDK transports require a separate native runtime. */
export const HTTP_SENDER_PROVIDERS = [
  SwqosType.Helius, SwqosType.Jito, SwqosType.Bloxroute, SwqosType.ZeroSlot,
  SwqosType.Temporal, SwqosType.FlashBlock, SwqosType.BlockRazor, SwqosType.Node1,
  SwqosType.Astralane, SwqosType.Stellium, SwqosType.Lightspeed,
] as const;

/** Public defaults only; never creates a connection or submits a transaction. */
export function httpSenderDefaults(type: typeof HTTP_SENDER_PROVIDERS[number], swqosOnly = true) {
  const endpoints: Partial<Record<SwqosType, string>> = {
    [SwqosType.Helius]: metadata.HELIUS_ENDPOINTS[SwqosRegion.Default],
    [SwqosType.Jito]: metadata.JITO_ENDPOINTS[SwqosRegion.Default],
    [SwqosType.Bloxroute]: metadata.BLOXROUTE_ENDPOINTS[SwqosRegion.Default],
    [SwqosType.ZeroSlot]: 'https://ny.0slot.trade',
    [SwqosType.Astralane]: metadata.ASTRALANE_ENDPOINTS[SwqosRegion.Default],
  };
  const url = endpoints[type] ?? '';
  const accounts: Record<typeof HTTP_SENDER_PROVIDERS[number], readonly string[]> = {
    [SwqosType.Helius]: metadata.HELIUS_TIP_ACCOUNTS, [SwqosType.Jito]: metadata.JITO_TIP_ACCOUNTS,
    [SwqosType.Bloxroute]: metadata.BLOXROUTE_TIP_ACCOUNTS, [SwqosType.ZeroSlot]: metadata.ZERO_SLOT_TIP_ACCOUNTS,
    [SwqosType.Temporal]: metadata.TEMPORAL_TIP_ACCOUNTS, [SwqosType.FlashBlock]: metadata.FLASH_BLOCK_TIP_ACCOUNTS,
    [SwqosType.BlockRazor]: metadata.BLOCK_RAZOR_TIP_ACCOUNTS, [SwqosType.Node1]: metadata.NODE1_TIP_ACCOUNTS,
    [SwqosType.Astralane]: metadata.ASTRALANE_TIP_ACCOUNTS, [SwqosType.Stellium]: metadata.STELLIUM_TIP_ACCOUNTS,
    [SwqosType.Lightspeed]: ['53PhM3UTdMQWu5t81wcd35AHGc5xpmHoRjem7GQPvXjA'],
  };
  const tips: Record<typeof HTTP_SENDER_PROVIDERS[number], number> = {
    [SwqosType.Helius]: swqosOnly ? metadata.MIN_TIP_HELIUS : metadata.MIN_TIP_HELIUS_NORMAL,
    [SwqosType.Jito]: metadata.MIN_TIP_JITO, [SwqosType.Bloxroute]: metadata.MIN_TIP_BLOXROUTE,
    [SwqosType.ZeroSlot]: metadata.MIN_TIP_ZERO_SLOT, [SwqosType.Temporal]: metadata.MIN_TIP_TEMPORAL,
    [SwqosType.FlashBlock]: metadata.MIN_TIP_FLASH_BLOCK, [SwqosType.BlockRazor]: metadata.MIN_TIP_BLOCK_RAZOR,
    [SwqosType.Node1]: metadata.MIN_TIP_NODE1, [SwqosType.Astralane]: metadata.MIN_TIP_ASTRALANE,
    [SwqosType.Stellium]: metadata.MIN_TIP_STELLIUM, [SwqosType.Lightspeed]: metadata.MIN_TIP_LIGHTSPEED,
  };
  return {
    type, url, swqosOnly: type === SwqosType.Helius && swqosOnly,
    tipAccount: accounts[type][0]!,
    tipLamports: Math.round(tips[type] * 1_000_000_000),
  };
}
