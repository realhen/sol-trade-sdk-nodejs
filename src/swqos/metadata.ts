import { SwqosRegion } from '../enums';

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

export const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export const ZERO_SLOT_TIP_ACCOUNTS = [
  'Eb2KpSC8uMt9GmzyAEm5Eb1AAAgTjRaXWFjKyFXHZxF3',
  'FCjUJZ1qozm1e8romw216qyfQMaaWKxWsuySnumVCCNe',
  'ENxTEjSQ1YabmUpXAdCgevnHQ9MHdLv8tzFiuiYJqa13',
  '6rYLG55Q9RpsPGvqdPNJs4z5WTxJVatMB8zV3WJhs5EK',
  'Cix2bHfqPcKcM233mzxbLk14kSggUUiz2A87fJtGivXr',
];

export const TEMPORAL_TIP_ACCOUNTS = [
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

export const FLASH_BLOCK_TIP_ACCOUNTS = [
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

export const HELIUS_TIP_ACCOUNTS = [
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

export const NODE1_TIP_ACCOUNTS = [
  'node1PqAa3BWWzUnTHVbw8NJHC874zn9ngAkXjgWEej',
  'node1UzzTxAAeBTpfZkQPJXBAqixsbdth11ba1NXLBG',
  'node1Qm1bV4fwYnCurP8otJ9s5yrkPq7SPZ5uhj3Tsv',
  'node1PUber6SFmSQgvf2ECmXsHP5o3boRSGhvJyPMX1',
  'node1AyMbeqiVN6eoQzEAwCA6Pk826hrdqdAHR7cdJ3',
  'node1YtWCoTwwVYTFLfS19zquRQzYX332hs1HEuRBjC',
];

export const BLOCK_RAZOR_TIP_ACCOUNTS = [
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

export const ASTRALANE_TIP_ACCOUNTS = [
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

export const BLOXROUTE_TIP_ACCOUNTS = [
  'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg',
  '3UQUKjhMKaY2S6bjcQD6yHB7utcZt5bfarRCmctpRtUd',
  'FogxVNs6Mm2w9rnGL1vkARSwJxvLE8mujTv3LK8RnUhF',
];

export const STELLIUM_TIP_ACCOUNTS = [
  'ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH',
  'ste11MWPjXCRfQryCshzi86SGhuXjF4Lv6xMXD2AoSt',
  'ste11p5x8tJ53H1NbNQsRBg1YNRd4GcVpxtDw8PBpmb',
  'ste11p7e2KLYou5bwtt35H7BM6uMdo4pvioGjJXKFcN',
  'ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX',
];

export const NEXT_BLOCK_TIP_ACCOUNTS = [
  'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
  'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2',
  'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
  'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
  'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
  'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
  'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
  'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
];

export const SOYAS_TIP_ACCOUNTS = [
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

export const SPEEDLANDING_TIP_ACCOUNTS = [
  'SpEEdz8S1KorkMZqjMUxfxrmWwofmp6ReNP2Nx6CUmq',
  'SpeeDy3GJM4wcrQmk1itRFWgidvxX4rwjTLMv78wwjE',
  'SPeEdva37vW8vRtqgYjprQs1g3965icfVN5Rt7SMAyh',
  'speEdrSEpox5GUfHWcBc7tQjRuSfUin2yvB7qoYvvJh',
  'SPeEDmkHkN3A2roSZf6aZyEMsmrGqTHKqwP51y2Y4rV',
  'SpeedLdTJXh2RKpXEaP8JCxkWoUVXhtdPQ1EnxBJMxc',
  'SpEediGKLbbXndSYTzwmz6Z3NDgHQLDcTDEvGFkSMH9',
  'speede8xCcUq2Tiv1efXeTuE3k9TDNq8TnGKaKSc6J4',
];

export const SOLAMI_TIP_ACCOUNTS = [
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


export const MAX_HTTP_SENDER_ROUTES = 64;
