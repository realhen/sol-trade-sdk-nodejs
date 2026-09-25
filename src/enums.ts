/**
 * Trade operation type
 */
export enum TradeType {
  Buy = 'Buy',
  Sell = 'Sell',
}

/**
 * SWQOS service regions
 */
export enum SwqosRegion {
  Frankfurt = 'Frankfurt',
  NewYork = 'NewYork',
  Amsterdam = 'Amsterdam',
  Dublin = 'Dublin',
  Tokyo = 'Tokyo',
  Singapore = 'Singapore',
  SLC = 'SLC',
  London = 'London',
  LosAngeles = 'LosAngeles',
  Default = 'Default',
}

/**
 * SWQOS service types
 */
export enum SwqosType {
  Default = 'Default',
  Jito = 'Jito',
  Bloxroute = 'Bloxroute',
  ZeroSlot = 'ZeroSlot',
  Temporal = 'Temporal',
  FlashBlock = 'FlashBlock',
  BlockRazor = 'BlockRazor',
  Node1 = 'Node1',
  Astralane = 'Astralane',
  NextBlock = 'NextBlock',
  Helius = 'Helius',
  Stellium = 'Stellium',
  Lightspeed = 'Lightspeed',
  Soyas = 'Soyas',
  Speedlanding = 'Speedlanding',
  Solami = 'Solami',
  Triton = 'Triton',
  QuickNode = 'QuickNode',
  Syndica = 'Syndica',
  Figment = 'Figment',
  Alchemy = 'Alchemy',
}

export enum SwqosTransport {
  Http = 'Http',
  Grpc = 'Grpc',
  Quic = 'Quic',
}

export enum AstralaneTransport {
  Binary = 'Binary',
  Plain = 'Plain',
  Quic = 'Quic',
}

const SWQOS_BLACKLISTED_TYPES = new Set<SwqosType>([SwqosType.NextBlock]);

export function isSwqosTypeBlacklisted(type: SwqosType): boolean {
  return SWQOS_BLACKLISTED_TYPES.has(type);
}
