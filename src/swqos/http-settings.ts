import { SwqosType, SwqosRegion } from "../enums";
import * as metadata from "./metadata";

/** Browser-compatible providers. Other SDK transports require a separate native runtime. */
export const HTTP_SENDER_PROVIDERS = [
  SwqosType.Helius,
  SwqosType.Jito,
  SwqosType.Bloxroute,
  SwqosType.ZeroSlot,
  SwqosType.Temporal,
  SwqosType.FlashBlock,
  SwqosType.BlockRazor,
  SwqosType.Node1,
  SwqosType.Astralane,
  SwqosType.Stellium,
  SwqosType.Lightspeed,
] as const;

const accounts: Record<
  (typeof HTTP_SENDER_PROVIDERS)[number],
  readonly string[]
> = {
  [SwqosType.Helius]: metadata.HELIUS_TIP_ACCOUNTS,
  [SwqosType.Jito]: metadata.JITO_TIP_ACCOUNTS,
  [SwqosType.Bloxroute]: metadata.BLOXROUTE_TIP_ACCOUNTS,
  [SwqosType.ZeroSlot]: metadata.ZERO_SLOT_TIP_ACCOUNTS,
  [SwqosType.Temporal]: metadata.TEMPORAL_TIP_ACCOUNTS,
  [SwqosType.FlashBlock]: metadata.FLASH_BLOCK_TIP_ACCOUNTS,
  [SwqosType.BlockRazor]: metadata.BLOCK_RAZOR_TIP_ACCOUNTS,
  [SwqosType.Node1]: metadata.NODE1_TIP_ACCOUNTS,
  [SwqosType.Astralane]: metadata.ASTRALANE_TIP_ACCOUNTS,
  [SwqosType.Stellium]: metadata.STELLIUM_TIP_ACCOUNTS,
  [SwqosType.Lightspeed]: [
    "53PhM3UTdMQWu5t81wcd35AHGc5xpmHoRjem7GQPvXjA",
    "9tYF5yPDC1NP8s6diiB3kAX6ZZnva9DM3iDwJkBRarBB",
  ],
};

/** Public defaults only; never creates a connection or submits a transaction. */
export function httpSenderDefaults(
  type: (typeof HTTP_SENDER_PROVIDERS)[number],
  swqosOnly = true,
) {
  const url = httpSenderRegions(type)[0]?.url ?? "";
  const tips: Record<(typeof HTTP_SENDER_PROVIDERS)[number], number> = {
    [SwqosType.Helius]: swqosOnly
      ? metadata.MIN_TIP_HELIUS
      : metadata.MIN_TIP_HELIUS_NORMAL,
    [SwqosType.Jito]: metadata.MIN_TIP_JITO,
    [SwqosType.Bloxroute]: metadata.MIN_TIP_BLOXROUTE,
    [SwqosType.ZeroSlot]: metadata.MIN_TIP_ZERO_SLOT,
    [SwqosType.Temporal]: metadata.MIN_TIP_TEMPORAL,
    [SwqosType.FlashBlock]: metadata.MIN_TIP_FLASH_BLOCK,
    [SwqosType.BlockRazor]: metadata.MIN_TIP_BLOCK_RAZOR,
    [SwqosType.Node1]: metadata.MIN_TIP_NODE1,
    [SwqosType.Astralane]: metadata.MIN_TIP_ASTRALANE,
    [SwqosType.Stellium]: metadata.MIN_TIP_STELLIUM,
    [SwqosType.Lightspeed]: metadata.MIN_TIP_LIGHTSPEED,
  };
  return {
    type,
    url,
    swqosOnly: type === SwqosType.Helius && swqosOnly,
    tipAccount: accounts[type][0]!,
    tipLamports: Math.round(tips[type] * 1_000_000_000),
  };
}

/** Public HTTPS region choice. URLs contain no user credentials. */
export interface HttpSenderRegion {
  id: string;
  name: string;
  url: string;
}

/**
 * Returns catalogued HTTPS endpoints for trusted browser settings.
 * @remarks Empty means an account-specific endpoint is required. HTTP endpoints
 * are not upgraded implicitly. Existing custom URLs must be preserved by callers.
 */
export function httpSenderRegions(
  type: (typeof HTTP_SENDER_PROVIDERS)[number],
): HttpSenderRegion[] {
  const maps: Partial<Record<SwqosType, Partial<Record<SwqosRegion, string>>>> =
    {
      [SwqosType.Helius]: metadata.HELIUS_ENDPOINTS,
      [SwqosType.Jito]: metadata.JITO_ENDPOINTS,
      [SwqosType.Bloxroute]: metadata.BLOXROUTE_ENDPOINTS,
      [SwqosType.Astralane]: metadata.ASTRALANE_ENDPOINTS,
      // https://0slot.trade/docs.php documents HTTPS submission and these regions.
      [SwqosType.ZeroSlot]: {
        [SwqosRegion.NewYork]: "https://ny.0slot.trade",
        [SwqosRegion.Frankfurt]: "https://de.0slot.trade",
        [SwqosRegion.Amsterdam]: "https://ams.0slot.trade",
        [SwqosRegion.Tokyo]: "https://jp.0slot.trade",
        [SwqosRegion.LosAngeles]: "https://la.0slot.trade",
      },
      // https://github.com/temporalxyz/nozomi-sdk/blob/main/endpoints.json
      [SwqosType.Temporal]: {
        [SwqosRegion.Default]: "https://nozomi.temporal.xyz",
        [SwqosRegion.NewYork]: "https://ewr1.nozomi.temporal.xyz",
        [SwqosRegion.Frankfurt]: "https://fra2.nozomi.temporal.xyz",
        [SwqosRegion.Amsterdam]: "https://ams1.nozomi.temporal.xyz",
        [SwqosRegion.London]: "https://lon1.nozomi.temporal.xyz",
        [SwqosRegion.LosAngeles]: "https://lax1.nozomi.temporal.xyz",
        [SwqosRegion.Tokyo]: "https://tyo1.nozomi.temporal.xyz",
        [SwqosRegion.Singapore]: "https://sgp1.nozomi.temporal.xyz",
      },
      // https://www.blockrazor.io/ publishes this HTTPS transaction endpoint.
      [SwqosType.BlockRazor]: {
        [SwqosRegion.Frankfurt]:
          "https://frankfurt.solana.blockrazor.io/sendTransaction",
      },
    };
  const names: Partial<Record<SwqosRegion, string>> = {
    [SwqosRegion.Default]: "Automatic",
    [SwqosRegion.NewYork]: type === SwqosType.Temporal ? "Newark" : "New York",
    [SwqosRegion.LosAngeles]: "Los Angeles",
    [SwqosRegion.SLC]: "Salt Lake City",
  };
  const seen = new Set<string>();
  const entries = Object.entries(maps[type] ?? {}) as [SwqosRegion, string][];
  entries.sort(([a], [b]) =>
    a === b
      ? 0
      : a === SwqosRegion.Default
        ? -1
        : b === SwqosRegion.Default
          ? 1
          : 0,
  );
  return entries.flatMap(([id, url]) => {
    if (
      type === SwqosType.Bloxroute &&
      [SwqosRegion.Dublin, SwqosRegion.SLC, SwqosRegion.Singapore].includes(id)
    )
      return [];
    if (!url.startsWith("https://") || seen.has(url)) return [];
    seen.add(url);
    return [{ id, name: names[id] ?? id, url }];
  });
}

/** Returns a copy of the SDK's accepted tip recipients for one provider. */
export function httpSenderTipAccounts(
  type: (typeof HTTP_SENDER_PROVIDERS)[number],
): string[] {
  return [...accounts[type]];
}

/**
 * Selects a provider recipient when preparing a new transaction.
 * @remarks Persist the result with the signed transaction; retries must reuse it.
 * No network request or signing occurs here.
 */
export function randomHttpSenderTipAccount(
  type: (typeof HTTP_SENDER_PROVIDERS)[number],
): string {
  const recipients = accounts[type];
  return recipients[Math.floor(Math.random() * recipients.length)]!;
}
