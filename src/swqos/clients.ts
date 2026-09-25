/**
 * SWQOS Clients for Sol Trade SDK
 * Implements various SWQOS (Solana Write Queue Operating System) providers.
 */

import {
  AstralaneTransport,
  SwqosTransport,
  SwqosType,
  SwqosRegion,
  TradeType,
  isSwqosTypeBlacklisted,
} from '../enums';
import { TradeError } from '../sdk-errors';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// ===== Utility =====

export function randomChoice<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) {
    throw new Error('randomChoice called with empty array');
  }
  return item;
}

function appendQuery(url: string, params: Record<string, string | boolean | undefined>): string {
  const [base, query = ''] = url.split('?');
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base!;
}

async function parseBodyAsJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractSubmitSignature(
  result: unknown,
  fallbackSignature?: string,
  allowFallback = false,
): string {
  if (typeof result === 'string') {
    const signature = result.trim();
    if (signature) return signature;
    throw new TradeError(500, 'missing transaction signature in submit response');
  }
  if (Array.isArray(result) && result.length > 0) {
    return extractSubmitSignature(result[0], fallbackSignature, allowFallback);
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, any>;
    if (obj.success === false) throw new TradeError(502, 'Provider rejected transaction');
    if (obj.error) {
      throw new TradeError(obj.error.code || 500, obj.error.message || String(obj.error));
    }
    if (typeof obj.signature === 'string' && obj.signature) return obj.signature;
    if (typeof obj.result === 'string' && obj.result) return obj.result;
    if (obj.result) return extractSubmitSignature(obj.result, fallbackSignature, allowFallback);
    if (allowFallback && obj.success === true && fallbackSignature) return fallbackSignature;
  }
  throw new TradeError(500, 'missing transaction signature in submit response');
}

// ===== Constants =====

export const MIN_TIP_JITO = 0.00001;
export const MIN_TIP_BLOXROUTE = 0.0001;
export const MIN_TIP_ZERO_SLOT = 0.0001;
export const MIN_TIP_TEMPORAL = 0.0001;
export const MIN_TIP_FLASH_BLOCK = 0.0001;
export const MIN_TIP_BLOCK_RAZOR = 0.0001;
export const MIN_TIP_NODE1 = 0.0001;
export const MIN_TIP_ASTRALANE = 0.00001;
export const MIN_TIP_HELIUS = 0.000005;        // swqos_only
export const MIN_TIP_HELIUS_NORMAL = 0.0002;   // 普通模式
export const MIN_TIP_STELLIUM = 0.0001;
export const MIN_TIP_LIGHTSPEED = 0.0001;
export const MIN_TIP_NEXT_BLOCK = 0.001;
export const MIN_TIP_SOYAS = 0.001;
export const MIN_TIP_SPEEDLANDING = 0.001;
export const MIN_TIP_SOLAMI = 0.0001;
export const MIN_TIP_DEFAULT = 0.00001;

// ===== Tip Accounts =====

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

const ZERO_SLOT_TIP_ACCOUNTS = [
  'Eb2KpSC8uMt9GmzyAEm5Eb1AAAgTjRaXWFjKyFXHZxF3',
  'FCjUJZ1qozm1e8romw216qyfQMaaWKxWsuySnumVCCNe',
  'ENxTEjSQ1YabmUpXAdCgevnHQ9MHdLv8tzFiuiYJqa13',
  '6rYLG55Q9RpsPGvqdPNJs4z5WTxJVatMB8zV3WJhs5EK',
  'Cix2bHfqPcKcM233mzxbLk14kSggUUiz2A87fJtGivXr',
];

const TEMPORAL_TIP_ACCOUNTS = [
  'TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq',
  'noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4',
  'noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE',
  'noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo',
  'noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ',
  'nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L',
  'nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z',
  'nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu',
  'noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7',
  'nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP',
  'nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P',
  'nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge',
  'nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3',
  'nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ',
  'nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk',
  'nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne',
  'nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb',
];

const FLASH_BLOCK_TIP_ACCOUNTS = [
  'FLaShB3iXXTWE1vu9wQsChUKq3HFtpMAhb8kAh1pf1wi',
  'FLashhsorBmM9dLpuq6qATawcpqk1Y2aqaZfkd48iT3W',
  'FLaSHJNm5dWYzEgnHJWWJP5ccu128Mu61NJLxUf7mUXU',
  'FLaSHR4Vv7sttd6TyDF4yR1bJyAxRwWKbohDytEMu3wL',
  'FLASHRzANfcAKDuQ3RXv9hbkBy4WVEKDzoAgxJ56DiE4',
  'FLasHstqx11M8W56zrSEqkCyhMCCpr6ze6Mjdvqope5s',
  'FLAShWTjcweNT4NSotpjpxAkwxUr2we3eXQGhpTVzRwy',
  'FLasHXTqrbNvpWFB6grN47HGZfK6pze9HLNTgbukfPSk',
  'FLAShyAyBcKb39KPxSzXcepiS8iDYUhDGwJcJDPX4g2B',
  'FLAsHZTRcf3Dy1APaz6j74ebdMC6Xx4g6i9YxjyrDybR',
];

const HELIUS_TIP_ACCOUNTS = [
  '4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE',
  'D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ',
  '9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta',
  '5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn',
  '2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD',
  '2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ',
  'wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF',
  '3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT',
  '4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey',
  '4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or',
];

const NODE1_TIP_ACCOUNTS = [
  'node1PqAa3BWWzUnTHVbw8NJHC874zn9ngAkXjgWEej',
  'node1UzzTxAAeBTpfZkQPJXBAqixsbdth11ba1NXLBG',
  'node1Qm1bV4fwYnCurP8otJ9s5yrkPq7SPZ5uhj3Tsv',
  'node1PUber6SFmSQgvf2ECmXsHP5o3boRSGhvJyPMX1',
  'node1AyMbeqiVN6eoQzEAwCA6Pk826hrdqdAHR7cdJ3',
  'node1YtWCoTwwVYTFLfS19zquRQzYX332hs1HEuRBjC',
];

const BLOCK_RAZOR_TIP_ACCOUNTS = [
  'FjmZZrFvhnqqb9ThCuMVnENaM3JGVuGWNyCAxRJcFpg9',
  '6No2i3aawzHsjtThw81iq1EXPJN6rh8eSJCLaYZfKDTG',
  'A9cWowVAiHe9pJfKAj3TJiN9VpbzMUq6E4kEvf5mUT22',
  'Gywj98ophM7GmkDdaWs4isqZnDdFCW7B46TXmKfvyqSm',
  '68Pwb4jS7eZATjDfhmTXgRJjCiZmw1L7Huy4HNpnxJ3o',
  '4ABhJh5rZPjv63RBJBuyWzBK3g9gWMUQdTZP2kiW31V9',
  'B2M4NG5eyZp5SBQrSdtemzk5TqVuaWGQnowGaCBt8GyM',
  '5jA59cXMKQqZAVdtopv8q3yyw9SYfiE3vUCbt7p8MfVf',
  '5YktoWygr1Bp9wiS1xtMtUki1PeYuuzuCF98tqwYxf61',
  '295Avbam4qGShBYK7E9H5Ldew4B3WyJGmgmXfiWdeeyV',
  'EDi4rSy2LZgKJX74mbLTFk4mxoTgT6F7HxxzG2HBAFyK',
  'BnGKHAC386n4Qmv9xtpBVbRaUTKixjBe3oagkPFKtoy6',
  'Dd7K2Fp7AtoN8xCghKDRmyqr5U169t48Tw5fEd3wT9mq',
  'AP6qExwrbRgBAVaehg4b5xHENX815sMabtBzUzVB4v8S',
];

const ASTRALANE_TIP_ACCOUNTS = [
  'astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF',
  'astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm',
  'astra9xWY93QyfG6yM8zwsKsRodscjQ2uU2HKNL5prk',
  'astraRVUuTHjpwEVvNBeQEgwYx9w9CFyfxjYoobCZhL',
  'astraEJ2fEj8Xmy6KLG7B3VfbKfsHXhHrNdCQx7iGJK',
  'astraubkDw81n4LuutzSQ8uzHCv4BhPVhfvTcYv8SKC',
  'astraZW5GLFefxNPAatceHhYjfA1ciq9gvfEg2S47xk',
  'astrawVNP4xDBKT7rAdxrLYiTSTdqtUr63fSMduivXK',
  'AstrA1ejL4UeXC2SBP4cpeEmtcFPZVLxx3XGKXyCW6to',
  'AsTra79FET4aCKWspPqeSFvjJNyp96SvAnrmyAxqg5b7',
  'AstrABAu8CBTyuPXpV4eSCJ5fePEPnxN8NqBaPKQ9fHR',
  'AsTRADtvb6tTmrsqULQ9Wji9PigDMjhfEMza6zkynEvV',
  'AsTRAEoyMofR3vUPpf9k68Gsfb6ymTZttEtsAbv8Bk4d',
  'AStrAJv2RN2hKCHxwUMtqmSxgdcNZbihCwc1mCSnG83W',
  'Astran35aiQUF57XZsmkWMtNCtXGLzs8upfiqXxth2bz',
  'AStRAnpi6kFrKypragExgeRoJ1QnKH7pbSjLAKQVWUum',
  'ASTRaoF93eYt73TYvwtsv6fMWHWbGmMUZfVZPo3CRU9C',
];

const BLOXROUTE_TIP_ACCOUNTS = [
  'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg',
  '3UQUKjhMKaY2S6bjcQD6yHB7utcZt5bfarRCmctpRtUd',
  'FogxVNs6Mm2w9rnGL1vkARSwJxvLE8mujTv3LK8RnUhF',
];

const STELLIUM_TIP_ACCOUNTS = [
  'ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH',
  'ste11MWPjXCRfQryCshzi86SGhuXjF4Lv6xMXD2AoSt',
  'ste11p5x8tJ53H1NbNQsRBg1YNRd4GcVpxtDw8PBpmb',
  'ste11p7e2KLYou5bwtt35H7BM6uMdo4pvioGjJXKFcN',
  'ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX',
];

const NEXT_BLOCK_TIP_ACCOUNTS = [
  'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
  'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2',
  'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
  'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
  'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
  'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
  'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
  'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
];

const SOYAS_TIP_ACCOUNTS = [
  'soyas4s6L8KWZ8rsSk1mF3d1mQScoTGGAgjk98bF8nP',
  'soyascXFW5wEEYiwfEmHy2pNwomqzvggJosGVD6TJdY',
  'soyasDBdKjADwPz3xk82U3TNPRDKEWJj7wWLajNHZ1L',
  'soyasE2abjBAynmHbGWgEwk4ctBy7JMTUCNrMbjcnyH',
  'soyasi59njacMUPvo3TM5paHjeK8pYSdovXgFi32gRt',
  'soyasQYhJxv8uZgWDxhg72td6piAf7XTkoyWHtSATEz',
  'soyastP66xyYC8XADXZjdMM5BAVGD2YRvz8dwtLsqb8',
  'soyasvdgUJWYcUCzDxpmjUnNjH7KamXLXTzLwFvdVPE',
  'soyasvxAunisNxaoRxkKGjNir7KmbwYnr37JmefkX9G',
  'soyas5doVFUwH8s5zK8gEvCL5KR5ogDmf52LsrJEZ9h',
];

const SPEEDLANDING_TIP_ACCOUNTS = [
  'SpEEdz8S1KorkMZqjMUxfxrmWwofmp6ReNP2Nx6CUmq',
  'SpeeDy3GJM4wcrQmk1itRFWgidvxX4rwjTLMv78wwjE',
  'SPeEdva37vW8vRtqgYjprQs1g3965icfVN5Rt7SMAyh',
  'speEdrSEpox5GUfHWcBc7tQjRuSfUin2yvB7qoYvvJh',
  'SPeEDmkHkN3A2roSZf6aZyEMsmrGqTHKqwP51y2Y4rV',
  'SpeedLdTJXh2RKpXEaP8JCxkWoUVXhtdPQ1EnxBJMxc',
  'SpEediGKLbbXndSYTzwmz6Z3NDgHQLDcTDEvGFkSMH9',
  'speede8xCcUq2Tiv1efXeTuE3k9TDNq8TnGKaKSc6J4',
];

const SOLAMI_TIP_ACCOUNTS = [
  '15qWd4huAkoxvhDsHMfpUn27TW1YBYMMJJ2jkAkbeam',
  '9XuGciSwr5wb7dLTQm91JhuBTvj3GG8WjuRDc3obeam',
  'kiQioJNyFG7pU36ELLsRKXkeT48kFbk3b6rSgrWbeam',
  'kjmVhW1UzJrW2sU5bY5NtZ79jpvjSStsj37Pzmabeam',
  'kREnjPWFpt4AHeY5pijPmyXaCrMnbatUQJo7d3Xbeam',
  'praRZG6N6MdbsT4EFpKgZJWReZGXQhAMFcH68oCbeam',
  'SqoKQKU5uwBxovq3R7yEBxFwptc4z7vwoghU3M9beam',
  'sV72TY66T1RfmDSeHPPbwX6wwJ3bBv5hd4ehJ8tbeam',
  'swf8MyEeLo7gtRUo27UuJj6naCASUrypU7dbteSbeam',
  'uiuaQsxA47JybQAVN4FTfYuoEDkMiXV1r591Aewbeam',
];

// ===== Region Endpoint Maps =====

export const JITO_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Frankfurt]: 'https://frankfurt.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Dublin]: 'https://dublin.mainnet.block-engine.jito.wtf',
  [SwqosRegion.SLC]: 'https://slc.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Tokyo]: 'https://tokyo.mainnet.block-engine.jito.wtf',
  [SwqosRegion.London]: 'https://london.mainnet.block-engine.jito.wtf',
  [SwqosRegion.LosAngeles]: 'https://slc.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Singapore]: 'https://singapore.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Default]: 'https://mainnet.block-engine.jito.wtf',
};

export const BLOXROUTE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Frankfurt]: 'https://germany.solana.dex.blxrbdn.com',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.solana.dex.blxrbdn.com',
  [SwqosRegion.Dublin]: 'https://uk.solana.dex.blxrbdn.com',
  [SwqosRegion.SLC]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Tokyo]: 'https://tokyo.solana.dex.blxrbdn.com',
  [SwqosRegion.London]: 'https://uk.solana.dex.blxrbdn.com',
  [SwqosRegion.LosAngeles]: 'https://la.solana.dex.blxrbdn.com',
  [SwqosRegion.Singapore]: 'https://tokyo.solana.dex.blxrbdn.com',
  [SwqosRegion.Default]: 'https://global.solana.dex.blxrbdn.com',
};

export const ZERO_SLOT_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.0slot.trade',
  [SwqosRegion.Frankfurt]: 'http://de2.0slot.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.0slot.trade',
  [SwqosRegion.Dublin]: 'http://ams.0slot.trade',
  [SwqosRegion.SLC]: 'http://la.0slot.trade',
  [SwqosRegion.Tokyo]: 'http://jp.0slot.trade',
  [SwqosRegion.London]: 'http://ams.0slot.trade',
  [SwqosRegion.LosAngeles]: 'http://la.0slot.trade',
  [SwqosRegion.Singapore]: 'http://jp.0slot.trade',
  [SwqosRegion.Default]: 'http://de2.0slot.trade',
};

export const TEMPORAL_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.nozomi.temporal.xyz',
  [SwqosRegion.Frankfurt]: 'http://fra2.nozomi.temporal.xyz',
  [SwqosRegion.Amsterdam]: 'http://ams1.nozomi.temporal.xyz',
  [SwqosRegion.Dublin]: 'http://lon1.nozomi.temporal.xyz',
  [SwqosRegion.SLC]: 'http://lax1.nozomi.temporal.xyz',
  [SwqosRegion.Tokyo]: 'http://tyo1.nozomi.temporal.xyz',
  [SwqosRegion.London]: 'http://lon1.nozomi.temporal.xyz',
  [SwqosRegion.LosAngeles]: 'http://lax1.nozomi.temporal.xyz',
  [SwqosRegion.Singapore]: 'http://sgp1.nozomi.temporal.xyz',
  [SwqosRegion.Default]: 'http://fra2.nozomi.temporal.xyz',
};

export const FLASH_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.flashblock.trade',
  [SwqosRegion.Frankfurt]: 'http://fra.flashblock.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.flashblock.trade',
  [SwqosRegion.Dublin]: 'http://london.flashblock.trade',
  [SwqosRegion.SLC]: 'http://slc.flashblock.trade',
  [SwqosRegion.Tokyo]: 'http://tokyo.flashblock.trade',
  [SwqosRegion.London]: 'http://london.flashblock.trade',
  [SwqosRegion.LosAngeles]: 'http://slc.flashblock.trade',
  [SwqosRegion.Singapore]: 'http://singapore.flashblock.trade',
  [SwqosRegion.Default]: 'http://fra.flashblock.trade',
};

export const HELIUS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr-sender.helius-rpc.com/fast',
  [SwqosRegion.Frankfurt]: 'http://fra-sender.helius-rpc.com/fast',
  [SwqosRegion.Amsterdam]: 'http://ams-sender.helius-rpc.com/fast',
  [SwqosRegion.Dublin]: 'http://lon-sender.helius-rpc.com/fast',
  [SwqosRegion.SLC]: 'http://slc-sender.helius-rpc.com/fast',
  [SwqosRegion.Tokyo]: 'http://tyo-sender.helius-rpc.com/fast',
  [SwqosRegion.London]: 'http://lon-sender.helius-rpc.com/fast',
  [SwqosRegion.LosAngeles]: 'http://slc-sender.helius-rpc.com/fast',
  [SwqosRegion.Singapore]: 'http://sg-sender.helius-rpc.com/fast',
  [SwqosRegion.Default]: 'https://sender.helius-rpc.com/fast',
};

export const NODE1_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.node1.me',
  [SwqosRegion.Frankfurt]: 'http://fra.node1.me',
  [SwqosRegion.Amsterdam]: 'http://ams.node1.me',
  [SwqosRegion.Dublin]: 'http://lon.node1.me',
  [SwqosRegion.SLC]: 'http://ny.node1.me',
  [SwqosRegion.Tokyo]: 'http://tk.node1.me',
  [SwqosRegion.London]: 'http://lon.node1.me',
  [SwqosRegion.LosAngeles]: 'http://ny.node1.me',
  [SwqosRegion.Singapore]: 'http://tk.node1.me',
  [SwqosRegion.Default]: 'http://fra.node1.me',
};

export const BLOCK_RAZOR_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://newyork.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Frankfurt]: 'http://frankfurt.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Amsterdam]: 'http://amsterdam.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Dublin]: 'http://london.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.SLC]: 'http://newyork.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Tokyo]: 'http://tokyo.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.London]: 'http://london.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.LosAngeles]: 'http://losangeles.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Singapore]: 'http://singapore.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Default]: 'http://frankfurt.solana.blockrazor.xyz:443/sendTransaction',
};


export const ASTRALANE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.gateway.astralane.io/irisb',
  [SwqosRegion.Frankfurt]: 'http://fr.gateway.astralane.io/irisb',
  [SwqosRegion.Amsterdam]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.Dublin]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.SLC]: 'http://la.gateway.astralane.io/irisb',
  [SwqosRegion.Tokyo]: 'http://jp.gateway.astralane.io/irisb',
  [SwqosRegion.London]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.LosAngeles]: 'http://la.gateway.astralane.io/irisb',
  [SwqosRegion.Singapore]: 'http://sg.gateway.astralane.io/irisb',
  [SwqosRegion.Default]: 'https://edge.astralane.io/irisb',
};

export const ASTRALANE_QUIC_HOSTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'ny.gateway.astralane.io',
  [SwqosRegion.Frankfurt]: 'fr.gateway.astralane.io',
  [SwqosRegion.Amsterdam]: 'ams.gateway.astralane.io',
  [SwqosRegion.Dublin]: 'ams.gateway.astralane.io',
  [SwqosRegion.SLC]: 'la.gateway.astralane.io',
  [SwqosRegion.Tokyo]: 'jp.gateway.astralane.io',
  [SwqosRegion.London]: 'ams.gateway.astralane.io',
  [SwqosRegion.LosAngeles]: 'la.gateway.astralane.io',
  [SwqosRegion.Singapore]: 'sg.gateway.astralane.io',
  [SwqosRegion.Default]: 'lim.gateway.astralane.io',
};

export const STELLIUM_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Frankfurt]: 'http://fra1.flashrpc.com',
  [SwqosRegion.Amsterdam]: 'http://ams1.flashrpc.com',
  [SwqosRegion.Dublin]: 'http://lhr1.flashrpc.com',
  [SwqosRegion.SLC]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Tokyo]: 'http://tyo1.flashrpc.com',
  [SwqosRegion.London]: 'http://lhr1.flashrpc.com',
  [SwqosRegion.LosAngeles]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Singapore]: 'http://tyo1.flashrpc.com',
  [SwqosRegion.Default]: 'http://fra1.flashrpc.com',
};

export const NEXT_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.nextblock.io',
  [SwqosRegion.Frankfurt]: 'http://fra.nextblock.io',
  [SwqosRegion.Amsterdam]: 'http://ams.nextblock.io',
  [SwqosRegion.Dublin]: 'http://dublin.nextblock.io',
  [SwqosRegion.SLC]: 'http://slc.nextblock.io',
  [SwqosRegion.Tokyo]: 'http://tokyo.nextblock.io',
  [SwqosRegion.London]: 'http://london.nextblock.io',
  [SwqosRegion.LosAngeles]: 'http://slc.nextblock.io',
  [SwqosRegion.Singapore]: 'http://sgp.nextblock.io',
  [SwqosRegion.Default]: 'http://fra.nextblock.io',
};

export const SOYAS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Frankfurt]: 'fra.landing.soyas.xyz:9000',
  [SwqosRegion.Amsterdam]: 'ams.landing.soyas.xyz:9000',
  [SwqosRegion.Dublin]: 'lon.landing.soyas.xyz:9000',
  [SwqosRegion.SLC]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Tokyo]: 'tyo.landing.soyas.xyz:9000',
  [SwqosRegion.London]: 'lon.landing.soyas.xyz:9000',
  [SwqosRegion.LosAngeles]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Singapore]: 'tyo.landing.soyas.xyz:9000',
  [SwqosRegion.Default]: 'fra.landing.soyas.xyz:9000',
};

export const SPEEDLANDING_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Frankfurt]: 'fra.speedlanding.trade:17778',
  [SwqosRegion.Amsterdam]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.Dublin]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.SLC]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Tokyo]: 'tyo.speedlanding.trade:17778',
  [SwqosRegion.London]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.LosAngeles]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Singapore]: 'sgp.speedlanding.trade:17778',
  [SwqosRegion.Default]: 'fra.speedlanding.trade:17778',
};

export const SOLAMI_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'beam.solami.dev:11000',
  [SwqosRegion.Frankfurt]: 'beam.solami.dev:11000',
  [SwqosRegion.Amsterdam]: 'beam.solami.dev:11000',
  [SwqosRegion.Dublin]: 'beam.solami.dev:11000',
  [SwqosRegion.SLC]: 'beam.solami.dev:11000',
  [SwqosRegion.Tokyo]: 'beam.solami.dev:11000',
  [SwqosRegion.Singapore]: 'beam.solami.dev:11000',
  [SwqosRegion.London]: 'beam.solami.dev:11000',
  [SwqosRegion.LosAngeles]: 'beam.solami.dev:11000',
  [SwqosRegion.Default]: 'beam.solami.dev:11000',
};

// ===== SWQOS Client Interface =====

/** Options are local to one submission and never mutate the client. */
export interface HttpSendOptions {
  minContextSlot?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SwqosClient {
  sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string>;

  sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string[]>;

  getTipAccount(): string;
  getSwqosType(): SwqosType;
  minTipSol(): number;
}

// ===== HTTP Client Base =====

abstract class BaseClient implements SwqosClient {
  abstract getTipAccount(): string;
  abstract getSwqosType(): SwqosType;
  abstract minTipSol(): number;
  abstract sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string>;

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string[]> {
    const signatures: string[] = [];
    for (const tx of transactions) {
      const sig = await this.sendTransaction(tradeType, tx, waitConfirmation, options);
      signatures.push(sig);
    }
    return signatures;
  }

  protected async post(url: string, payload: unknown, headers: Record<string, string> = {}, options?: HttpSendOptions): Promise<unknown> {
    // Only Solana JSON-RPC sendTransaction accepts these config fields.
    const rpc = payload as { method?: string; params?: unknown[] };
    if (rpc?.method === 'sendTransaction' && Array.isArray(rpc.params)) {
      payload = { ...rpc, params: [rpc.params[0], {
        ...(rpc.params[1] as Record<string, unknown> | undefined),
        encoding: 'base64', skipPreflight: true, maxRetries: 0,
        ...(options?.minContextSlot === undefined ? {} : { minContextSlot: options.minContextSlot }),
      }] };
    }
    const response = await this.postRaw(url, JSON.stringify(payload), headers, 'application/json', options);
    if (options && rpc?.method === 'sendTransaction' && Array.isArray(rpc.params)) {
      const envelope = response as Record<string, unknown> | null;
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
          envelope.jsonrpc !== '2.0' || envelope.id !== (payload as { id?: unknown }).id ||
          (Object.prototype.hasOwnProperty.call(envelope, 'result') === Object.prototype.hasOwnProperty.call(envelope, 'error'))) {
        throw new TradeError(502, 'Invalid JSON-RPC submission response');
      }
      if (Object.prototype.hasOwnProperty.call(envelope, 'error')) {
        const error = envelope.error as { code?: number; message?: string } | null;
        throw new TradeError(error?.code ?? 502, error?.message || 'JSON-RPC submission failed');
      }
    }
    return response;
  }

  protected async postRaw(
    url: string,
    body: string | Buffer | Uint8Array,
    headers: Record<string, string> = {},
    contentType = 'text/plain',
    options: HttpSendOptions = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 8000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TradeError(400, 'HTTP timeout must be positive');
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('HTTP submission timed out')), timeoutMs);
    try {
      const request = {
        method: 'POST',
        headers: { 'Content-Type': contentType, ...headers, ...options.headers },
        body,
        signal: controller.signal,
        redirect: 'error' as const,
        credentials: 'omit' as const,
        referrerPolicy: 'no-referrer' as const,
        cache: 'no-store' as const,
      };
      const response = await fetch(url, request);
      if (!response.ok) throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
      return await parseBodyAsJsonOrText(response);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

function jitoUrl(endpoint: string, method: 'transactions' | 'bundles'): string {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/$/, '');
  url.pathname = /\/api\/v1\/(transactions|bundles)$/.test(path)
    ? path.replace(/(transactions|bundles)$/, method)
    : `${path}/api/v1/${method}`;
  return url.toString();
}

// ===== Jito Client =====

export class JitoClient extends BaseClient {
  private tipAccounts = JITO_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const headers: Record<string, string> = {};
    let url = jitoUrl(this.endpoint, 'transactions');
    if (this.authToken) {
      headers['x-jito-auth'] = this.authToken;
      url = appendQuery(url, { uuid: this.authToken });
    }

    const result = (await this.post(url, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string[]> {
    if (transactions.length === 0) return [];
    if (transactions.length === 1) {
      const tx = transactions[0]!;
      return [await this.sendTransaction(tradeType, tx, waitConfirmation, options)];
    }

    const encodedTxs = transactions.map(tx => tx.toString('base64'));

    const payload = {
      jsonrpc: '2.0',
      method: 'sendBundle',
      params: [encodedTxs, { encoding: 'base64' }],
      id: 1,
    };

    const headers: Record<string, string> = {};
    let url = jitoUrl(this.endpoint, 'bundles');
    if (this.authToken) {
      headers['x-jito-auth'] = this.authToken;
      url = appendQuery(url, { uuid: this.authToken });
    }

    const result = (await this.post(url, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    // Bundle returns a single bundle ID, wrap in array for interface compatibility
    return [extractSubmitSignature(result)];
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Jito;
  }

  minTipSol(): number {
    return MIN_TIP_JITO;
  }
}

// ===== Bloxroute Client =====

export class BloxrouteClient extends BaseClient {
  private tipAccounts = BLOXROUTE_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transaction: { content: encoded },
      frontRunningProtection: false,
      useStakedRPCs: true,
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit`;
    const result = (await this.post(url, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || result.error);
    }
    if (result.reason) {
      throw new TradeError(500, result.reason);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Bloxroute;
  }

  minTipSol(): number {
    return MIN_TIP_BLOXROUTE;
  }
}

// ===== ZeroSlot Client =====

export class ZeroSlotClient extends BaseClient {
  private tipAccounts = ZERO_SLOT_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Auth in URL param, no Authorization header
    let url = this.endpoint;
    if (this.authToken) {
      url = `${this.endpoint}?api-key=${this.authToken}`;
    }

    const result = (await this.post(url, payload, {}, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.ZeroSlot;
  }

  minTipSol(): number {
    return MIN_TIP_ZERO_SLOT;
  }
}

// ===== Temporal Client =====

const TEMPORAL_MAX_BATCH_SIZE = 16;
const TEMPORAL_MIN_TX_SIZE = 66;
const TEMPORAL_MAX_TX_SIZE = 1232;

export function encodeTemporalBatch(transactions: readonly Buffer[]): Buffer {
  if (transactions.length === 0) {
    throw new TradeError(400, 'Temporal batch cannot be empty');
  }
  if (transactions.length > TEMPORAL_MAX_BATCH_SIZE) {
    throw new TradeError(400, `Temporal batch has ${transactions.length} transactions; maximum is ${TEMPORAL_MAX_BATCH_SIZE}`);
  }
  let size = 0;
  for (const tx of transactions) {
    if (tx.length < TEMPORAL_MIN_TX_SIZE || tx.length > TEMPORAL_MAX_TX_SIZE) {
      throw new TradeError(400, `Temporal transaction size ${tx.length} is outside ${TEMPORAL_MIN_TX_SIZE}..${TEMPORAL_MAX_TX_SIZE} bytes`);
    }
    size += 2 + tx.length;
  }
  const body = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const tx of transactions) {
    body.writeUInt16BE(tx.length, offset);
    offset += 2;
    tx.copy(body, offset);
    offset += tx.length;
  }
  return body;
}

function temporalBatchUrl(endpoint: string, authToken?: string, forceTls = false): string {
  const raw = /^https?:\/\//.test(endpoint) ? endpoint : `http://${endpoint}`;
  const url = new URL(raw);
  if (forceTls) url.protocol = 'https:';
  url.pathname = '/api/sendBatch';
  if (authToken) url.searchParams.set('c', authToken);
  return url.toString();
}

export class TemporalClient extends BaseClient {
  private tipAccounts = TEMPORAL_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const body = encodeTemporalBatch([transaction]);
    await this.postRaw(
      temporalBatchUrl(this.endpoint, this.authToken),
      body,
      {},
      'application/octet-stream',
      options,
    );
    return signatureFromSerializedTransaction(transaction);
  }

  override async sendTransactions(tradeType: TradeType, transactions: Buffer[], waitConfirmation: boolean, options?: HttpSendOptions): Promise<string[]> {
    const signatures: string[] = [];
    for (let start = 0; start < transactions.length; start += TEMPORAL_MAX_BATCH_SIZE) {
      const batch = transactions.slice(start, start + TEMPORAL_MAX_BATCH_SIZE);
      await this.postRaw(temporalBatchUrl(this.endpoint, this.authToken), encodeTemporalBatch(batch), {}, 'application/octet-stream', options);
      signatures.push(...batch.map(signatureFromSerializedTransaction));
    }
    return signatures;
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Temporal;
  }

  minTipSol(): number {
    return MIN_TIP_TEMPORAL;
  }
}

// ===== FlashBlock Client =====

export class FlashBlockClient extends BaseClient {
  private tipAccounts = FLASH_BLOCK_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transactions: [encoded],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit-batch`;
    const result = (await this.post(url, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    // Batch submit may return array of results
    if (Array.isArray(result) && result.length > 0) {
      return extractSubmitSignature(result[0], signatureFromSerializedTransaction(transaction), true);
    }

    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.FlashBlock;
  }

  minTipSol(): number {
    return MIN_TIP_FLASH_BLOCK;
  }
}

// ===== Helius Client =====

export class HeliusClient extends BaseClient {
  private tipAccounts = HELIUS_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private apiKey?: string,
    private swqosOnly: boolean = false
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: '1',  // string "1" per Helius API spec
      method: 'sendTransaction',
      params: [
        encoded,
        {
          encoding: 'base64',
          skipPreflight: true,
          maxRetries: 0,
        },
      ],
    };

    const url = appendQuery(this.endpoint, {
      'api-key': this.apiKey,
      swqos_only: this.swqosOnly ? true : undefined,
    });

    const result = (await this.post(url, payload, {}, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Helius;
  }

  minTipSol(): number {
    return this.swqosOnly ? MIN_TIP_HELIUS : MIN_TIP_HELIUS_NORMAL;
  }
}

// ===== Node1 Client =====

export class Node1Client extends BaseClient {
  private tipAccounts = NODE1_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64', skipPreflight: true }],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      // Header name is 'api-key', not 'Authorization: Bearer'
      headers['api-key'] = this.authToken;
    }

    // endpoint is the full URL (e.g., http://ny.node1.me)
    const result = (await this.post(this.endpoint, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Node1;
  }

  minTipSol(): number {
    return MIN_TIP_NODE1;
  }
}

export class BlockRazorClient extends BaseClient {
  private tipAccounts = BLOCK_RAZOR_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string,
    private mevProtection: boolean = false
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const mode = this.mevProtection ? 'sandwichMitigation' : 'fast';
    const headers: Record<string, string> = {};
    if (this.authToken) headers.apikey = this.authToken;
    const result = await this.post(this.endpoint, {
      transaction: transaction.toString('base64'),
      mode,
      safeWindow: 3,
      revertProtection: false,
    }, headers, options);
    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.BlockRazor;
  }

  minTipSol(): number {
    return MIN_TIP_BLOCK_RAZOR;
  }
}

// ===== Astralane Client =====

export class AstralaneClient extends BaseClient {
  private tipAccounts = ASTRALANE_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const query: Record<string, string | undefined> = { method: 'sendTransaction' };
    if (this.authToken) query['api-key'] = this.authToken;
    const url = appendQuery(this.endpoint, query);

    const result = await this.postRaw(
      url,
      transaction,
      {},
      'application/octet-stream',
      options,
    );

    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Astralane;
  }

  minTipSol(): number {
    return MIN_TIP_ASTRALANE;
  }
}

// ===== Stellium Client =====

export class StelliumClient extends BaseClient {
  private tipAccounts = STELLIUM_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Token is appended directly to path: {endpoint}/{token}
    let url = this.endpoint;
    if (this.authToken) {
      url = `${this.endpoint}/${this.authToken}`;
    }

    const result = (await this.post(url, payload, {}, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Stellium;
  }

  minTipSol(): number {
    return MIN_TIP_STELLIUM;
  }
}

// ===== Lightspeed Client =====

export class LightspeedClient extends BaseClient {
  constructor(
    private rpcUrl: string,
    private customUrl: string  // must be provided, format already contains api_key
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        {
          encoding: 'base64',
          skipPreflight: true,
          preflightCommitment: 'processed',
          maxRetries: 0,
        },
      ],
    };

    // customUrl already contains api_key in its format
    const result = (await this.post(this.customUrl, payload, {}, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    // Lightspeed has 2 tip accounts
    const accounts = [
      '53PhM3UTdMQWu5t81wcd35AHGc5xpmHoRjem7GQPvXjA',
      '9tYF5yPDC1NP8s6diiB3kAX6ZZnva9DM3iDwJkBRarBB',
    ];
    return randomChoice(accounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Lightspeed;
  }

  minTipSol(): number {
    return MIN_TIP_LIGHTSPEED;
  }
}

// ===== NextBlock Client =====

export class NextBlockClient extends BaseClient {
  private tipAccounts = NEXT_BLOCK_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transaction: { content: encoded },
      frontRunningProtection: false,
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit`;
    const result = (await this.post(url, payload, headers, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }
    if (result.reason) {
      throw new TradeError(500, result.reason);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.NextBlock;
  }

  minTipSol(): number {
    return MIN_TIP_NEXT_BLOCK;
  }
}

// ===== Default RPC Client =====

export class DefaultClient extends BaseClient {
  constructor(private rpcUrl: string) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean,
    options?: HttpSendOptions
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const result = (await this.post(this.rpcUrl, payload, {}, options)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return '';
  }

  getSwqosType(): SwqosType {
    return SwqosType.Default;
  }

  minTipSol(): number {
    return MIN_TIP_DEFAULT;
  }
}

function signatureFromSerializedTransaction(raw: Buffer | Uint8Array): string {
  const data = raw instanceof Buffer ? raw : Buffer.from(raw);
  const signatureCount = data[0] ?? 0;
  if (signatureCount !== 1 || data.length < 65) {
    throw new TradeError(400, 'Only single-signature versioned transactions are supported for SWQOS submit');
  }
  return bs58.encode(data.subarray(1, 65));
}

// Native-only providers retain metadata compatibility but cannot submit over HTTP.
abstract class HttpUnavailableClient extends BaseClient {
  constructor(_rpcUrl: string, _endpoint: string, _apiKey?: string) { super(); }
  async sendTransaction(_tradeType: TradeType, _transaction: Buffer, _waitConfirmation: boolean, _options?: HttpSendOptions): Promise<string> {
    throw new TradeError(501, `${this.getSwqosType()} HTTP submission is unavailable`);
  }
}
export class SoyasClient extends HttpUnavailableClient {
  getTipAccount(): string { return randomChoice(SOYAS_TIP_ACCOUNTS); }
  getSwqosType(): SwqosType { return SwqosType.Soyas; }
  minTipSol(): number { return MIN_TIP_SOYAS; }
}

export class SpeedlandingClient extends HttpUnavailableClient {
  getTipAccount(): string { return randomChoice(SPEEDLANDING_TIP_ACCOUNTS); }
  getSwqosType(): SwqosType { return SwqosType.Speedlanding; }
  minTipSol(): number { return MIN_TIP_SPEEDLANDING; }
}

export class SolamiClient extends HttpUnavailableClient {
  getTipAccount(): string { return randomChoice(SOLAMI_TIP_ACCOUNTS); }
  getSwqosType(): SwqosType { return SwqosType.Solami; }
  minTipSol(): number { return MIN_TIP_SOLAMI; }
}

export interface SwqosClientConfig {
  type: SwqosType;
  region?: SwqosRegion;
  customUrl?: string;
  apiKey?: string;
  mevProtection?: boolean;
  transport?: SwqosTransport;
  astralaneTransport?: AstralaneTransport;
  swqosOnly?: boolean;
}

export class ClientFactory {
  static createClient(config: SwqosClientConfig, rpcUrl: string): SwqosClient {
    if (isSwqosTypeBlacklisted(config.type)) {
      throw new TradeError(
        400,
        `SWQOS type is blacklisted by Rust v4.0.21 parity: ${config.type}`
      );
    }
    if ((config.transport !== undefined && config.transport !== SwqosTransport.Http) ||
        config.astralaneTransport === AstralaneTransport.Quic) {
      throw new TradeError(400, 'Only HTTP SWQOS transport is available; gRPC and QUIC are unsupported');
    }
    const region = config.region ?? SwqosRegion.Default;

    switch (config.type) {
      case SwqosType.Jito: {
        const endpoint = config.customUrl || JITO_ENDPOINTS[region];
        return new JitoClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Bloxroute: {
        const endpoint = config.customUrl || BLOXROUTE_ENDPOINTS[region];
        return new BloxrouteClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.ZeroSlot: {
        const endpoint = config.customUrl || ZERO_SLOT_ENDPOINTS[region];
        return new ZeroSlotClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Temporal: {
        const endpoint = config.customUrl || TEMPORAL_ENDPOINTS[region];
        return new TemporalClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.FlashBlock: {
        const endpoint = config.customUrl || FLASH_BLOCK_ENDPOINTS[region];
        return new FlashBlockClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Helius: {
        const endpoint = config.customUrl || HELIUS_ENDPOINTS[region];
        return new HeliusClient(rpcUrl, endpoint, config.apiKey, config.swqosOnly ?? false);
      }

      case SwqosType.Node1: {
        const endpoint = config.customUrl || NODE1_ENDPOINTS[region];
        return new Node1Client(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.BlockRazor: {
        const endpoint = config.customUrl || BLOCK_RAZOR_ENDPOINTS[region];
        return new BlockRazorClient(rpcUrl, endpoint, config.apiKey, config.mevProtection ?? false);
      }

      case SwqosType.Astralane: {
        const baseEndpoint = config.customUrl || ASTRALANE_ENDPOINTS[region];
        const endpoint = config.astralaneTransport === AstralaneTransport.Plain
          ? baseEndpoint.replace('/irisb', '/iris') : baseEndpoint;
        return new AstralaneClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Stellium: {
        const endpoint = config.customUrl || STELLIUM_ENDPOINTS[region];
        return new StelliumClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Lightspeed: {
        if (!config.customUrl) {
          throw new TradeError(400, 'LightspeedClient requires customUrl (format already contains api_key)');
        }
        return new LightspeedClient(rpcUrl, config.customUrl);
      }

      case SwqosType.NextBlock: {
        const endpoint = config.customUrl || NEXT_BLOCK_ENDPOINTS[region];
        return new NextBlockClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Soyas: {
        const endpoint = config.customUrl || SOYAS_ENDPOINTS[region];
        return new SoyasClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Speedlanding: {
        const endpoint = config.customUrl || SPEEDLANDING_ENDPOINTS[region];
        return new SpeedlandingClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Solami: {
        const endpoint = config.customUrl || SOLAMI_ENDPOINTS[region];
        return new SolamiClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Default:
        return new DefaultClient(config.customUrl || rpcUrl);

      default:
        throw new TradeError(
          400,
          `Unsupported SWQOS type for Rust v4.0.21 trading path: ${config.type}`
        );
    }
  }
}

// ===== Convenience Function =====

export function createSwqosClient(
  swqosType: SwqosType,
  rpcUrl: string,
  authToken?: string,
  region?: SwqosRegion,
  customUrl?: string,
  mevProtection: boolean = false
): SwqosClient {
  const config: SwqosClientConfig = {
    type: swqosType,
    region,
    customUrl,
    apiKey: authToken,
    mevProtection,
  };
  return ClientFactory.createClient(config, rpcUrl);
}
