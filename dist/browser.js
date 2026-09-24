var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/instruction/pumpfun_builder.ts
var pumpfun_builder_exports = {};
__export(pumpfun_builder_exports, {
  PUMPFUN_BONDING_CURVE_SEED: () => PUMPFUN_BONDING_CURVE_SEED,
  PUMPFUN_BONDING_CURVE_V2_SEED: () => PUMPFUN_BONDING_CURVE_V2_SEED,
  PUMPFUN_BUYBACK_FEE_RECIPIENTS: () => PUMPFUN_BUYBACK_FEE_RECIPIENTS,
  PUMPFUN_BUY_DISCRIMINATOR: () => PUMPFUN_BUY_DISCRIMINATOR,
  PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR: () => PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR,
  PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR: () => PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR,
  PUMPFUN_BUY_V2_DISCRIMINATOR: () => PUMPFUN_BUY_V2_DISCRIMINATOR,
  PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR: () => PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR,
  PUMPFUN_CREATOR_VAULT_SEED: () => PUMPFUN_CREATOR_VAULT_SEED,
  PUMPFUN_EVENT_AUTHORITY: () => PUMPFUN_EVENT_AUTHORITY,
  PUMPFUN_FEE_CONFIG: () => PUMPFUN_FEE_CONFIG,
  PUMPFUN_FEE_PROGRAM: () => PUMPFUN_FEE_PROGRAM,
  PUMPFUN_FEE_RECIPIENT: () => PUMPFUN_FEE_RECIPIENT,
  PUMPFUN_GLOBAL_ACCOUNT: () => PUMPFUN_GLOBAL_ACCOUNT,
  PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR: () => PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR,
  PUMPFUN_MAYHEM_FEE_RECIPIENTS: () => PUMPFUN_MAYHEM_FEE_RECIPIENTS,
  PUMPFUN_PROGRAM_ID: () => PUMPFUN_PROGRAM_ID,
  PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS: () => PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS,
  PUMPFUN_SELL_DISCRIMINATOR: () => PUMPFUN_SELL_DISCRIMINATOR,
  PUMPFUN_SELL_V2_DISCRIMINATOR: () => PUMPFUN_SELL_V2_DISCRIMINATOR,
  PUMPFUN_SHARING_CONFIG_SEED: () => PUMPFUN_SHARING_CONFIG_SEED,
  PUMPFUN_STANDARD_FEE_RECIPIENTS: () => PUMPFUN_STANDARD_FEE_RECIPIENTS,
  PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED: () => PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED,
  buildPumpFunBuyInstructions: () => buildPumpFunBuyInstructions,
  buildPumpFunBuyV2Instructions: () => buildPumpFunBuyV2Instructions,
  buildPumpFunClaimCashbackInstruction: () => buildPumpFunClaimCashbackInstruction,
  buildPumpFunSellInstructions: () => buildPumpFunSellInstructions,
  buildPumpFunSellV2Instructions: () => buildPumpFunSellV2Instructions,
  fetchBondingCurveAccount: () => fetchBondingCurveAccount,
  getBondingCurvePda: () => getBondingCurvePda,
  getBondingCurveV2Pda: () => getBondingCurveV2Pda,
  getBuyPrice: () => getBuyPrice,
  getCreator: () => getCreator,
  getCreatorVaultPda: () => getCreatorVaultPda,
  getPumpFunBuybackFeeRecipientRandom: () => getPumpFunBuybackFeeRecipientRandom,
  getPumpFunFeeSharingConfigPda: () => getPumpFunFeeSharingConfigPda,
  getPumpFunProtocolExtraFeeRecipientRandom: () => getPumpFunProtocolExtraFeeRecipientRandom,
  getPumpFunUserVolumeAccumulatorPda: () => getPumpFunUserVolumeAccumulatorPda,
  getRandomMayhemFeeRecipient: () => getRandomMayhemFeeRecipient,
  getStandardFeeRecipientRandom: () => getStandardFeeRecipientRandom,
  pumpFunFeeRecipientMeta: () => pumpFunFeeRecipientMeta
});
import { Buffer as Buffer3 } from "buffer";
import {
  PublicKey as PublicKey2,
  Keypair,
  TransactionInstruction as TransactionInstruction2,
  SystemProgram as SystemProgram2
} from "@solana/web3.js";

// src/common/spl-token.ts
var spl_token_exports = {};
__export(spl_token_exports, {
  ASSOCIATED_TOKEN_PROGRAM_ID: () => ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountState: () => AccountState,
  AuthorityType: () => AuthorityType,
  MINT_SIZE: () => MINT_SIZE,
  MULTISIG_SIZE: () => MULTISIG_SIZE,
  NATIVE_MINT: () => NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID: () => TOKEN_2022_PROGRAM_ID,
  TOKEN_ACCOUNT_SIZE: () => TOKEN_ACCOUNT_SIZE,
  TOKEN_DECIMALS: () => TOKEN_DECIMALS,
  TOKEN_PROGRAM_ID: () => TOKEN_PROGRAM_ID,
  TokenInstruction: () => TokenInstruction,
  TokenInstructionBuilder: () => TokenInstructionBuilder,
  TokenUtil: () => TokenUtil,
  USDC_MINT: () => USDC_MINT,
  USDT_MINT: () => USDT_MINT,
  WSOL_MINT: () => WSOL_MINT,
  createAssociatedTokenAccountIdempotentInstruction: () => createAssociatedTokenAccountIdempotentInstruction,
  createAssociatedTokenAccountInstruction: () => createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction: () => createCloseAccountInstruction,
  createSyncNativeInstruction: () => createSyncNativeInstruction,
  getAssociatedTokenAddressSync: () => getAssociatedTokenAddressSync
});
import { Buffer as Buffer2 } from "buffer";
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";
var TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
var TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
var ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
var AccountState = /* @__PURE__ */ ((AccountState2) => {
  AccountState2[AccountState2["Uninitialized"] = 0] = "Uninitialized";
  AccountState2[AccountState2["Initialized"] = 1] = "Initialized";
  AccountState2[AccountState2["Frozen"] = 2] = "Frozen";
  return AccountState2;
})(AccountState || {});
var TOKEN_ACCOUNT_SIZE = 165;
var MINT_SIZE = 82;
var MULTISIG_SIZE = 355;
var TokenInstruction = /* @__PURE__ */ ((TokenInstruction2) => {
  TokenInstruction2[TokenInstruction2["InitializeMint"] = 0] = "InitializeMint";
  TokenInstruction2[TokenInstruction2["InitializeAccount"] = 1] = "InitializeAccount";
  TokenInstruction2[TokenInstruction2["InitializeMultisig"] = 2] = "InitializeMultisig";
  TokenInstruction2[TokenInstruction2["Transfer"] = 3] = "Transfer";
  TokenInstruction2[TokenInstruction2["Approve"] = 4] = "Approve";
  TokenInstruction2[TokenInstruction2["Revoke"] = 5] = "Revoke";
  TokenInstruction2[TokenInstruction2["SetAuthority"] = 6] = "SetAuthority";
  TokenInstruction2[TokenInstruction2["MintTo"] = 7] = "MintTo";
  TokenInstruction2[TokenInstruction2["Burn"] = 8] = "Burn";
  TokenInstruction2[TokenInstruction2["CloseAccount"] = 9] = "CloseAccount";
  TokenInstruction2[TokenInstruction2["FreezeAccount"] = 10] = "FreezeAccount";
  TokenInstruction2[TokenInstruction2["ThawAccount"] = 11] = "ThawAccount";
  TokenInstruction2[TokenInstruction2["TransferChecked"] = 12] = "TransferChecked";
  TokenInstruction2[TokenInstruction2["ApproveChecked"] = 13] = "ApproveChecked";
  TokenInstruction2[TokenInstruction2["MintToChecked"] = 14] = "MintToChecked";
  TokenInstruction2[TokenInstruction2["BurnChecked"] = 15] = "BurnChecked";
  TokenInstruction2[TokenInstruction2["InitializeAccount2"] = 16] = "InitializeAccount2";
  TokenInstruction2[TokenInstruction2["SyncNative"] = 17] = "SyncNative";
  TokenInstruction2[TokenInstruction2["InitializeAccount3"] = 18] = "InitializeAccount3";
  TokenInstruction2[TokenInstruction2["InitializeMultisig2"] = 19] = "InitializeMultisig2";
  TokenInstruction2[TokenInstruction2["InitializeMint2"] = 20] = "InitializeMint2";
  TokenInstruction2[TokenInstruction2["GetAccountDataSize"] = 21] = "GetAccountDataSize";
  TokenInstruction2[TokenInstruction2["InitializeImmutableOwner"] = 22] = "InitializeImmutableOwner";
  TokenInstruction2[TokenInstruction2["AmountToUiAmount"] = 23] = "AmountToUiAmount";
  TokenInstruction2[TokenInstruction2["UiAmountToAmount"] = 24] = "UiAmountToAmount";
  TokenInstruction2[TokenInstruction2["InitializeMintCloseAuthority"] = 25] = "InitializeMintCloseAuthority";
  TokenInstruction2[TokenInstruction2["CreateNativeMint"] = 29] = "CreateNativeMint";
  TokenInstruction2[TokenInstruction2["InitializeNonTransferableMint"] = 27] = "InitializeNonTransferableMint";
  TokenInstruction2[TokenInstruction2["InitializePermanentDelegate"] = 35] = "InitializePermanentDelegate";
  return TokenInstruction2;
})(TokenInstruction || {});
var AuthorityType = /* @__PURE__ */ ((AuthorityType2) => {
  AuthorityType2[AuthorityType2["MintTokens"] = 0] = "MintTokens";
  AuthorityType2[AuthorityType2["FreezeAccount"] = 1] = "FreezeAccount";
  AuthorityType2[AuthorityType2["AccountOwner"] = 2] = "AccountOwner";
  AuthorityType2[AuthorityType2["CloseAccount"] = 3] = "CloseAccount";
  return AuthorityType2;
})(AuthorityType || {});
var TokenInstructionBuilder = class {
  /**
   * Create InitializeMint instruction
   */
  static initializeMint(mint, decimals, mintAuthority, freezeAuthority, tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ];
    const data = Buffer2.alloc(67);
    data.writeUInt8(0 /* InitializeMint */, 0);
    data.writeUInt8(decimals, 1);
    data.writeUInt8(1, 2);
    data.set(mintAuthority.toBytes(), 3);
    data.writeUInt8(freezeAuthority ? 1 : 0, 35);
    if (freezeAuthority) {
      data.set(freezeAuthority.toBytes(), 36);
    }
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create InitializeAccount instruction
   */
  static initializeAccount(account, mint, owner, tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ];
    const data = Buffer2.from([1 /* InitializeAccount */]);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create Transfer instruction
   */
  static transfer(source, destination, owner, amount, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.alloc(9);
    data.writeUInt8(3 /* Transfer */, 0);
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create TransferChecked instruction
   */
  static transferChecked(source, mint, destination, owner, amount, decimals, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.alloc(10);
    data.writeUInt8(12 /* TransferChecked */, 0);
    data.writeBigUInt64LE(amount, 1);
    data.writeUInt8(decimals, 9);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create MintTo instruction
   */
  static mintTo(mint, destination, authority, amount, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      {
        pubkey: authority,
        isSigner: multiSigners.length === 0,
        isWritable: false
      },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.alloc(9);
    data.writeUInt8(7 /* MintTo */, 0);
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create Burn instruction
   */
  static burn(account, mint, owner, amount, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.alloc(9);
    data.writeUInt8(8 /* Burn */, 0);
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create Approve instruction
   */
  static approve(account, delegate, owner, amount, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: delegate, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.alloc(9);
    data.writeUInt8(4 /* Approve */, 0);
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create Revoke instruction
   */
  static revoke(account, owner, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.from([5 /* Revoke */]);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create CloseAccount instruction
   */
  static closeAccount(account, destination, owner, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false
      }))
    ];
    const data = Buffer2.from([9 /* CloseAccount */]);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
  /**
   * Create SyncNative instruction (for WSOL accounts)
   */
  static syncNative(nativeAccount, tokenProgram = TOKEN_PROGRAM_ID) {
    const keys = [{ pubkey: nativeAccount, isSigner: false, isWritable: true }];
    const data = Buffer2.from([17 /* SyncNative */]);
    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data
    });
  }
};
var TokenUtil = class {
  /**
   * Calculate associated token account address
   */
  static async getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
    if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBytes())) {
      throw new Error("Token owner is off curve");
    }
    const [address] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      associatedTokenProgram
    );
    return address;
  }
  /**
   * Create associated token account idempotent instruction
   */
  static createAssociatedTokenAccountIdempotentInstruction(payer, associatedToken, owner, mint, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false }
    ];
    const data = Buffer2.from([1]);
    return new TransactionInstruction({
      keys,
      programId: associatedTokenProgram,
      data
    });
  }
  /**
   * Create associated token account instruction
   */
  static createAssociatedTokenAccountInstruction(payer, associatedToken, owner, mint, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false }
    ];
    const data = Buffer2.alloc(0);
    return new TransactionInstruction({
      keys,
      programId: associatedTokenProgram,
      data
    });
  }
  /**
   * Check if a token is a wrapped SOL (WSOL) token
   */
  static isWrappedSol(mint) {
    return mint.equals(WSOL_MINT);
  }
  /**
   * Convert token amount to UI amount (with decimals)
   */
  static toUiAmount(amount, decimals) {
    return Number(amount) / Math.pow(10, decimals);
  }
  /**
   * Convert UI amount to token amount (with decimals)
   */
  static fromUiAmount(uiAmount, decimals) {
    return BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
  }
  /**
   * Format token amount for display
   */
  static formatAmount(amount, decimals, maxDecimals = 6) {
    const uiAmount = this.toUiAmount(amount, decimals);
    return uiAmount.toLocaleString("en-US", {
      maximumFractionDigits: maxDecimals
    });
  }
};
var WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);
var NATIVE_MINT = WSOL_MINT;
function getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve = false, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBytes())) {
    throw new Error("Token owner is off curve");
  }
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    associatedTokenProgram
  )[0];
}
function createAssociatedTokenAccountInstruction(payer, associatedToken, owner, mint, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
  return TokenUtil.createAssociatedTokenAccountInstruction(
    payer,
    associatedToken,
    owner,
    mint,
    tokenProgram,
    associatedTokenProgram
  );
}
function createAssociatedTokenAccountIdempotentInstruction(payer, associatedToken, owner, mint, tokenProgram = TOKEN_PROGRAM_ID, associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID) {
  return TokenUtil.createAssociatedTokenAccountIdempotentInstruction(
    payer,
    associatedToken,
    owner,
    mint,
    tokenProgram,
    associatedTokenProgram
  );
}
function createCloseAccountInstruction(account, destination, authority, multiSigners = [], tokenProgram = TOKEN_PROGRAM_ID) {
  return TokenInstructionBuilder.closeAccount(
    account,
    destination,
    authority,
    multiSigners.map(
      (signer) => signer instanceof PublicKey ? signer : signer.publicKey
    ),
    tokenProgram
  );
}
function createSyncNativeInstruction(account, tokenProgram = TOKEN_PROGRAM_ID) {
  return TokenInstructionBuilder.syncNative(account, tokenProgram);
}
var USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
var USDT_MINT = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
);
var TOKEN_DECIMALS = {
  SOL: 9,
  WSOL: 9,
  USDC: 6,
  USDT: 6
};

// src/instruction/pumpfun_builder.ts
var SOL_TOKEN_ACCOUNT = new PublicKey2(
  "So11111111111111111111111111111111111111111"
);
var PUMPFUN_PROGRAM_ID = new PublicKey2(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
var PUMPFUN_EVENT_AUTHORITY = new PublicKey2(
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
);
var PUMPFUN_FEE_PROGRAM = new PublicKey2(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);
var PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR = new PublicKey2(
  "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y"
);
var PUMPFUN_FEE_CONFIG = new PublicKey2(
  "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt"
);
var PUMPFUN_GLOBAL_ACCOUNT = new PublicKey2(
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
);
var PUMPFUN_FEE_RECIPIENT = new PublicKey2(
  "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"
);
var PUMPFUN_STANDARD_FEE_RECIPIENTS = [
  PUMPFUN_FEE_RECIPIENT,
  new PublicKey2("7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ"),
  new PublicKey2("7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX"),
  new PublicKey2("9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz"),
  new PublicKey2("AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY"),
  new PublicKey2("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
  new PublicKey2("FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz"),
  new PublicKey2("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP")
];
var PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS = [
  new PublicKey2("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"),
  new PublicKey2("9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7"),
  new PublicKey2("GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL"),
  new PublicKey2("3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR"),
  new PublicKey2("5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6"),
  new PublicKey2("EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL"),
  new PublicKey2("5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD"),
  new PublicKey2("A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW")
];
var PUMPFUN_BUYBACK_FEE_RECIPIENTS = PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS;
var PUMPFUN_MAYHEM_FEE_RECIPIENTS = [
  new PublicKey2("GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS"),
  new PublicKey2("4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6"),
  new PublicKey2("8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR"),
  new PublicKey2("4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH"),
  new PublicKey2("8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6"),
  new PublicKey2("Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk"),
  new PublicKey2("463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq"),
  new PublicKey2("6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA")
];
var PUMPFUN_BUY_DISCRIMINATOR = Buffer3.from([
  102,
  6,
  61,
  18,
  1,
  218,
  235,
  234
]);
var PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR = Buffer3.from([
  56,
  252,
  116,
  8,
  158,
  223,
  205,
  95
]);
var PUMPFUN_SELL_DISCRIMINATOR = Buffer3.from([
  51,
  230,
  133,
  164,
  1,
  127,
  131,
  173
]);
var PUMPFUN_BUY_V2_DISCRIMINATOR = Buffer3.from([
  184,
  23,
  238,
  97,
  103,
  197,
  211,
  61
]);
var PUMPFUN_SELL_V2_DISCRIMINATOR = Buffer3.from([
  93,
  246,
  130,
  60,
  231,
  233,
  64,
  178
]);
var PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR = Buffer3.from([
  194,
  171,
  28,
  70,
  104,
  77,
  91,
  47
]);
var PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR = Buffer3.from([
  37,
  58,
  35,
  126,
  190,
  53,
  228,
  197
]);
var PUMPFUN_BONDING_CURVE_SEED = Buffer3.from("bonding-curve");
var PUMPFUN_BONDING_CURVE_V2_SEED = Buffer3.from("bonding-curve-v2");
var PUMPFUN_CREATOR_VAULT_SEED = Buffer3.from("creator-vault");
var PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED = Buffer3.from(
  "user_volume_accumulator"
);
var PUMPFUN_SHARING_CONFIG_SEED = Buffer3.from("sharing-config");
function getBondingCurvePda(mint) {
  const [pda] = PublicKey2.findProgramAddressSync(
    [PUMPFUN_BONDING_CURVE_SEED, mint.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}
function getBondingCurveV2Pda(mint) {
  const [pda] = PublicKey2.findProgramAddressSync(
    [PUMPFUN_BONDING_CURVE_V2_SEED, mint.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}
function getCreatorVaultPda(creator) {
  const [pda] = PublicKey2.findProgramAddressSync(
    [PUMPFUN_CREATOR_VAULT_SEED, creator.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}
function getPumpFunUserVolumeAccumulatorPda(user) {
  const [pda] = PublicKey2.findProgramAddressSync(
    [PUMPFUN_USER_VOLUME_ACCUMULATOR_SEED, user.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}
function getPumpFunFeeSharingConfigPda(mint) {
  const [pda] = PublicKey2.findProgramAddressSync(
    [PUMPFUN_SHARING_CONFIG_SEED, mint.toBuffer()],
    PUMPFUN_FEE_PROGRAM
  );
  return pda;
}
function getRandomMayhemFeeRecipient() {
  const index = Math.floor(
    Math.random() * PUMPFUN_MAYHEM_FEE_RECIPIENTS.length
  );
  const recipient = PUMPFUN_MAYHEM_FEE_RECIPIENTS[index];
  if (!recipient) {
    return PUMPFUN_MAYHEM_FEE_RECIPIENTS[0];
  }
  return recipient;
}
function getStandardFeeRecipientRandom() {
  const index = Math.floor(
    Math.random() * PUMPFUN_STANDARD_FEE_RECIPIENTS.length
  );
  return PUMPFUN_STANDARD_FEE_RECIPIENTS[index] ?? PUMPFUN_FEE_RECIPIENT;
}
function getPumpFunProtocolExtraFeeRecipientRandom() {
  const index = Math.floor(
    Math.random() * PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS.length
  );
  return PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS[index] ?? PUMPFUN_PROTOCOL_EXTRA_FEE_RECIPIENTS[0];
}
function getPumpFunBuybackFeeRecipientRandom() {
  const index = Math.floor(
    Math.random() * PUMPFUN_BUYBACK_FEE_RECIPIENTS.length
  );
  return PUMPFUN_BUYBACK_FEE_RECIPIENTS[index] ?? PUMPFUN_BUYBACK_FEE_RECIPIENTS[0];
}
function pumpFunFeeRecipientMeta(fromStream, isMayhemMode) {
  if (fromStream && !fromStream.equals(PublicKey2.default)) {
    return fromStream;
  }
  return isMayhemMode ? getRandomMayhemFeeRecipient() : getStandardFeeRecipientRandom();
}
function validateMinimumOutput(params, exactInput) {
  if (params.minimumOutputAmount === void 0) return;
  if (params.minimumOutputAmount < 0n || params.minimumOutputAmount > 18446744073709551615n) {
    throw new Error("minimumOutputAmount must fit an unsigned 64-bit amount");
  }
  if (params.fixedOutputAmount !== void 0 || exactInput === false) {
    throw new Error(
      "minimumOutputAmount requires exact-input buy without fixedOutputAmount"
    );
  }
}
var MAX_SLIPPAGE_BPS = BigInt(9999);
var PUMPFUN_FEE_BASIS_POINTS = 95n;
var PUMPFUN_CREATOR_FEE_BASIS_POINTS = 30n;
var PHANTOM_DEFAULT_CREATOR_VAULT = new PublicKey2(
  "2DR3iqRPVThyRLVJnwjPW1qiGWrp8RUFfHVjMbZyhdNc"
);
function calculateWithSlippageBuy(amount, basisPoints) {
  const bps = basisPoints > MAX_SLIPPAGE_BPS ? MAX_SLIPPAGE_BPS : basisPoints;
  return amount + amount * bps / BigInt(1e4);
}
function calculateWithSlippageSell(amount, basisPoints) {
  const bps = basisPoints > MAX_SLIPPAGE_BPS ? MAX_SLIPPAGE_BPS : basisPoints;
  const result = amount - amount * bps / BigInt(1e4);
  return result > BigInt(0) ? result : BigInt(1);
}
function isUsablePubkey(value) {
  return value !== void 0 && !value.equals(PublicKey2.default) && !value.equals(PHANTOM_DEFAULT_CREATOR_VAULT);
}
function effectiveCreatorForTrade(protocolParams) {
  if (isUsablePubkey(protocolParams.observedTradeCreator)) {
    return protocolParams.observedTradeCreator;
  }
  if (isUsablePubkey(protocolParams.bondingCurve.creator)) {
    return protocolParams.bondingCurve.creator;
  }
  return PublicKey2.default;
}
function resolveCreatorVaultForIx(protocolParams, mint) {
  if (isUsablePubkey(protocolParams.creatorVault)) {
    return protocolParams.creatorVault;
  }
  if (isUsablePubkey(protocolParams.feeSharingCreatorVaultIfActive)) {
    return protocolParams.feeSharingCreatorVaultIfActive;
  }
  const creator = effectiveCreatorForTrade(protocolParams);
  if (isUsablePubkey(creator)) {
    return getCreatorVaultPda(creator);
  }
  throw new Error(
    `creator_vault PDA derivation failed for mint ${mint.toBase58()}`
  );
}
function resolveCreatorVaultForSellV2(protocolParams, mint) {
  if (isUsablePubkey(protocolParams.creatorVault)) {
    return protocolParams.creatorVault;
  }
  if (isUsablePubkey(protocolParams.feeSharingCreatorVaultIfActive)) {
    return protocolParams.feeSharingCreatorVaultIfActive;
  }
  const curveCreator = protocolParams.bondingCurve.creator;
  if (isUsablePubkey(curveCreator)) {
    return getCreatorVaultPda(curveCreator);
  }
  throw new Error(
    `creator_vault PDA derivation failed (curve_creator=${String(curveCreator)}, mint=${mint.toBase58()})`
  );
}
function effectivePumpMintTokenProgram(mint, protocolParams) {
  if (isUsablePubkey(protocolParams.tokenProgram)) {
    return protocolParams.tokenProgram;
  }
  return TOKEN_2022_PROGRAM_ID;
}
function effectiveQuoteMint(protocolParams) {
  if (!isUsablePubkey(protocolParams.quoteMint) || protocolParams.quoteMint.equals(SOL_TOKEN_ACCOUNT)) {
    return NATIVE_MINT;
  }
  return protocolParams.quoteMint;
}
function usesPumpFunV2Layout(protocolParams) {
  return isUsablePubkey(protocolParams.quoteMint) && !protocolParams.quoteMint.equals(SOL_TOKEN_ACCOUNT);
}
function isSolQuoteMint(mint) {
  return mint.equals(SOL_TOKEN_ACCOUNT) || mint.equals(NATIVE_MINT);
}
function validateV2BuyQuoteMint(inputMint, quoteMint) {
  if (isSolQuoteMint(quoteMint)) {
    if (inputMint.equals(SOL_TOKEN_ACCOUNT) || inputMint.equals(NATIVE_MINT))
      return;
  } else if (inputMint.equals(quoteMint)) {
    return;
  }
  throw new Error(
    `PumpFun V2 buy input_mint ${inputMint.toBase58()} does not match quote_mint ${quoteMint.toBase58()}; USDC quote pools must be bought with USDC, not SOL`
  );
}
function validateV2SellQuoteMint(outputMint, quoteMint) {
  if (isSolQuoteMint(quoteMint)) {
    if (outputMint.equals(SOL_TOKEN_ACCOUNT) || outputMint.equals(NATIVE_MINT))
      return;
  } else if (outputMint.equals(quoteMint)) {
    return;
  }
  throw new Error(
    `PumpFun V2 sell output_mint ${outputMint.toBase58()} does not match quote_mint ${quoteMint.toBase58()}; USDC quote pools settle to USDC, not SOL`
  );
}
function associatedTokenAddress(mint, owner, tokenProgram) {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}
function pushCreateOrWrapUserTokenAccount(instructions, payer, ata, mint, tokenProgram, amount) {
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      payer,
      mint,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  if (mint.equals(NATIVE_MINT)) {
    instructions.push(
      SystemProgram2.transfer({
        fromPubkey: payer,
        toPubkey: ata,
        lamports: amount
      })
    );
    instructions.push(createSyncNativeInstruction(ata));
  }
}
function getBuyTokenAmountFromSolAmount(amount, bondingCurve, creator) {
  if (amount === 0n || bondingCurve.virtualTokenReserves === 0n) {
    return 0n;
  }
  const totalFeeBps = PUMPFUN_FEE_BASIS_POINTS + (isUsablePubkey(creator) ? PUMPFUN_CREATOR_FEE_BASIS_POINTS : 0n);
  const inputAmount = amount * 10000n / (totalFeeBps + 10000n);
  const denominator = bondingCurve.virtualSolReserves + inputAmount;
  if (denominator === 0n) {
    return 0n;
  }
  let tokensReceived = inputAmount * bondingCurve.virtualTokenReserves / denominator;
  tokensReceived = tokensReceived < bondingCurve.realTokenReserves ? tokensReceived : bondingCurve.realTokenReserves;
  if (tokensReceived <= 100n * 1000000n) {
    tokensReceived = amount > 10000000n ? 25547619n * 1000000n : 255476n * 1000000n;
  }
  return tokensReceived;
}
function getSellSolAmountFromTokenAmount(amount, bondingCurve, creator) {
  if (amount === 0n || bondingCurve.virtualTokenReserves === 0n) {
    return 0n;
  }
  const solCost = amount * bondingCurve.virtualSolReserves / (bondingCurve.virtualTokenReserves + amount);
  const totalFeeBps = PUMPFUN_FEE_BASIS_POINTS + (isUsablePubkey(creator) ? PUMPFUN_CREATOR_FEE_BASIS_POINTS : 0n);
  const fee = (solCost * totalFeeBps + 9999n) / 10000n;
  return solCost > fee ? solCost - fee : 0n;
}
function buildPumpFunBuyInstructions(params) {
  const {
    payer,
    inputMint = SOL_TOKEN_ACCOUNT,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = true,
    createInputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
    useExactSolAmount = true
  } = params;
  if (usesPumpFunV2Layout(protocolParams)) {
    return buildPumpFunBuyV2Instructions({
      ...params,
      inputMint,
      createInputMintAta,
      closeInputMintAta
    });
  }
  validateMinimumOutput(params, params.useExactSolAmount);
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions = [];
  const { bondingCurve, creatorVault, associatedBondingCurve, feeRecipient } = protocolParams;
  const creator = effectiveCreatorForTrade(protocolParams);
  const creatorVaultAccount = (() => {
    try {
      return resolveCreatorVaultForIx(protocolParams, outputMint);
    } catch {
      return creatorVault;
    }
  })();
  const bondingCurveAddr = bondingCurve.account.equals(PublicKey2.default) || !bondingCurve.account ? getBondingCurvePda(outputMint) : bondingCurve.account;
  const tokenProgramId = effectivePumpMintTokenProgram(
    outputMint,
    protocolParams
  );
  const associatedBondingCurveAddr = associatedBondingCurve && !associatedBondingCurve.equals(PublicKey2.default) ? associatedBondingCurve : associatedTokenAddress(outputMint, bondingCurveAddr, tokenProgramId);
  const userTokenAccount = associatedTokenAddress(
    outputMint,
    payerPubkey,
    tokenProgramId
  );
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        userTokenAccount,
        payerPubkey,
        outputMint,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  const feeRecipientPk = pumpFunFeeRecipientMeta(
    feeRecipient,
    bondingCurve.isMayhemMode
  );
  const bondingCurveV2 = getBondingCurveV2Pda(outputMint);
  const trackVolume = params.trackVolume === false ? 0 : 1;
  const buyTokenAmount = params.minimumOutputAmount ?? fixedOutputAmount ?? getBuyTokenAmountFromSolAmount(inputAmount, bondingCurve, creator);
  const maxSolCost = calculateWithSlippageBuy(inputAmount, slippageBasisPoints);
  let data;
  if (fixedOutputAmount !== void 0) {
    data = Buffer3.alloc(25);
    PUMPFUN_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(fixedOutputAmount, 8);
    data.writeBigUInt64LE(inputAmount, 16);
    data[24] = trackVolume;
  } else if (useExactSolAmount) {
    const minTokensOut = params.minimumOutputAmount ?? calculateWithSlippageSell(buyTokenAmount, slippageBasisPoints);
    data = Buffer3.alloc(25);
    PUMPFUN_BUY_EXACT_SOL_IN_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(minTokensOut, 16);
    data[24] = trackVolume;
  } else {
    data = Buffer3.alloc(25);
    PUMPFUN_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(buyTokenAmount, 8);
    data.writeBigUInt64LE(maxSolCost, 16);
    data[24] = trackVolume;
  }
  const keys = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: creatorVaultAccount, isSigner: false, isWritable: true },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR,
      isSigner: false,
      isWritable: false
    },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.buybackFeeRecipient ?? getPumpFunProtocolExtraFeeRecipientRandom(),
      isSigner: false,
      isWritable: true
    }
  ];
  instructions.push(
    new TransactionInstruction2({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data
    })
  );
  return instructions;
}
function buildPumpFunSellInstructions(params) {
  const {
    payer,
    inputMint,
    outputMint = SOL_TOKEN_ACCOUNT,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (usesPumpFunV2Layout(protocolParams)) {
    return buildPumpFunSellV2Instructions({
      ...params,
      outputMint,
      createOutputMintAta
    });
  }
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions = [];
  const {
    bondingCurve,
    creatorVault,
    associatedBondingCurve,
    closeTokenAccountWhenSell,
    feeRecipient
  } = protocolParams;
  const creator = effectiveCreatorForTrade(protocolParams);
  const creatorVaultAccount = (() => {
    try {
      return resolveCreatorVaultForIx(protocolParams, inputMint);
    } catch {
      return creatorVault;
    }
  })();
  const bondingCurveAddr = bondingCurve.account.equals(PublicKey2.default) || !bondingCurve.account ? getBondingCurvePda(inputMint) : bondingCurve.account;
  const tokenProgramId = effectivePumpMintTokenProgram(
    inputMint,
    protocolParams
  );
  const associatedBondingCurveAddr = associatedBondingCurve && !associatedBondingCurve.equals(PublicKey2.default) ? associatedBondingCurve : associatedTokenAddress(inputMint, bondingCurveAddr, tokenProgramId);
  const userTokenAccount = associatedTokenAddress(
    inputMint,
    payerPubkey,
    tokenProgramId
  );
  const feeRecipientPk = pumpFunFeeRecipientMeta(
    feeRecipient,
    bondingCurve.isMayhemMode
  );
  const bondingCurveV2 = getBondingCurveV2Pda(inputMint);
  const minSolOutput = params.minimumOutputAmount ?? fixedOutputAmount ?? calculateWithSlippageSell(
    getSellSolAmountFromTokenAmount(inputAmount, bondingCurve, creator),
    slippageBasisPoints
  );
  const data = Buffer3.alloc(24);
  PUMPFUN_SELL_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minSolOutput, 16);
  const keys = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: creatorVaultAccount, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false }
  ];
  if (bondingCurve.isCashbackCoin) {
    const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);
    keys.push({
      pubkey: userVolumeAccumulator,
      isSigner: false,
      isWritable: true
    });
  }
  keys.push({ pubkey: bondingCurveV2, isSigner: false, isWritable: false });
  keys.push({
    pubkey: protocolParams.buybackFeeRecipient ?? getPumpFunProtocolExtraFeeRecipientRandom(),
    isSigner: false,
    isWritable: true
  });
  instructions.push(
    new TransactionInstruction2({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta || closeTokenAccountWhenSell) {
    instructions.push(
      createCloseAccountInstruction(
        userTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        tokenProgramId
      )
    );
  }
  return instructions;
}
function buildPumpFunBuyV2Instructions(params) {
  const {
    payer,
    inputMint = SOL_TOKEN_ACCOUNT,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = true,
    createInputMintAta = false,
    closeInputMintAta = false,
    protocolParams,
    useExactSolAmount = true
  } = params;
  validateMinimumOutput(params, params.useExactSolAmount);
  if (inputAmount === 0n) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions = [];
  const bondingCurve = protocolParams.bondingCurve;
  const creator = effectiveCreatorForTrade(protocolParams);
  const creatorVaultAccount = resolveCreatorVaultForIx(
    protocolParams,
    outputMint
  );
  const bondingCurveAddr = bondingCurve.account.equals(PublicKey2.default) || !bondingCurve.account ? getBondingCurvePda(outputMint) : bondingCurve.account;
  const baseTokenProgram = effectivePumpMintTokenProgram(
    outputMint,
    protocolParams
  );
  const quoteMint = effectiveQuoteMint(protocolParams);
  validateV2BuyQuoteMint(inputMint, quoteMint);
  const quoteTokenProgram = TOKEN_PROGRAM_ID;
  const associatedBaseBondingCurve = associatedTokenAddress(
    outputMint,
    bondingCurveAddr,
    baseTokenProgram
  );
  const associatedBaseUser = associatedTokenAddress(
    outputMint,
    payerPubkey,
    baseTokenProgram
  );
  const feeRecipientPk = pumpFunFeeRecipientMeta(
    protocolParams.feeRecipient,
    bondingCurve.isMayhemMode
  );
  const buybackFeeRecipient = protocolParams.buybackFeeRecipient ?? getPumpFunBuybackFeeRecipientRandom();
  const associatedQuoteFeeRecipient = associatedTokenAddress(
    quoteMint,
    feeRecipientPk,
    quoteTokenProgram
  );
  const associatedQuoteBuybackFeeRecipient = associatedTokenAddress(
    quoteMint,
    buybackFeeRecipient,
    quoteTokenProgram
  );
  const associatedQuoteBondingCurve = associatedTokenAddress(
    quoteMint,
    bondingCurveAddr,
    quoteTokenProgram
  );
  const associatedQuoteUser = associatedTokenAddress(
    quoteMint,
    payerPubkey,
    quoteTokenProgram
  );
  const associatedCreatorVault = associatedTokenAddress(
    quoteMint,
    creatorVaultAccount,
    quoteTokenProgram
  );
  const sharingConfig = getPumpFunFeeSharingConfigPda(outputMint);
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);
  const associatedUserVolumeAccumulator = associatedTokenAddress(
    quoteMint,
    userVolumeAccumulator,
    quoteTokenProgram
  );
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        associatedBaseUser,
        payerPubkey,
        outputMint,
        baseTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  const buyTokenAmount = params.minimumOutputAmount ?? fixedOutputAmount ?? getBuyTokenAmountFromSolAmount(inputAmount, bondingCurve, creator);
  const maxSolCost = calculateWithSlippageBuy(inputAmount, slippageBasisPoints);
  let data;
  let quoteAmountToFund;
  if (fixedOutputAmount !== void 0) {
    data = Buffer3.alloc(24);
    PUMPFUN_BUY_V2_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(fixedOutputAmount, 8);
    data.writeBigUInt64LE(inputAmount, 16);
    quoteAmountToFund = inputAmount;
  } else if (useExactSolAmount) {
    const minTokensOut = params.minimumOutputAmount ?? calculateWithSlippageSell(buyTokenAmount, slippageBasisPoints);
    data = Buffer3.alloc(24);
    PUMPFUN_BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(minTokensOut, 16);
    quoteAmountToFund = inputAmount;
  } else {
    data = Buffer3.alloc(24);
    PUMPFUN_BUY_V2_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(buyTokenAmount, 8);
    data.writeBigUInt64LE(maxSolCost, 16);
    quoteAmountToFund = maxSolCost;
  }
  if (createInputMintAta) {
    pushCreateOrWrapUserTokenAccount(
      instructions,
      payerPubkey,
      associatedQuoteUser,
      quoteMint,
      quoteTokenProgram,
      quoteAmountToFund
    );
  }
  const keys = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false
    },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteFeeRecipient, isSigner: false, isWritable: true },
    { pubkey: buybackFeeRecipient, isSigner: false, isWritable: true },
    {
      pubkey: associatedQuoteBuybackFeeRecipient,
      isSigner: false,
      isWritable: true
    },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBaseBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteBondingCurve, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: associatedBaseUser, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteUser, isSigner: false, isWritable: true },
    { pubkey: creatorVaultAccount, isSigner: false, isWritable: true },
    { pubkey: associatedCreatorVault, isSigner: false, isWritable: true },
    { pubkey: sharingConfig, isSigner: false, isWritable: false },
    {
      pubkey: PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR,
      isSigner: false,
      isWritable: false
    },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    {
      pubkey: associatedUserVolumeAccumulator,
      isSigner: false,
      isWritable: true
    },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction2({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta && quoteMint.equals(NATIVE_MINT)) {
    instructions.push(
      createCloseAccountInstruction(
        associatedQuoteUser,
        payerPubkey,
        payerPubkey,
        [],
        quoteTokenProgram
      )
    );
  }
  return instructions;
}
function buildPumpFunSellV2Instructions(params) {
  const {
    payer,
    inputMint,
    outputMint = SOL_TOKEN_ACCOUNT,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === 0n) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair ? payer.publicKey : payer;
  const instructions = [];
  const bondingCurve = protocolParams.bondingCurve;
  const creator = effectiveCreatorForTrade(protocolParams);
  const creatorVaultAccount = resolveCreatorVaultForSellV2(
    protocolParams,
    inputMint
  );
  const bondingCurveAddr = bondingCurve.account.equals(PublicKey2.default) || !bondingCurve.account ? getBondingCurvePda(inputMint) : bondingCurve.account;
  const baseTokenProgram = effectivePumpMintTokenProgram(
    inputMint,
    protocolParams
  );
  const quoteMint = effectiveQuoteMint(protocolParams);
  validateV2SellQuoteMint(outputMint, quoteMint);
  const quoteTokenProgram = TOKEN_PROGRAM_ID;
  const associatedBaseBondingCurve = associatedTokenAddress(
    inputMint,
    bondingCurveAddr,
    baseTokenProgram
  );
  const associatedBaseUser = associatedTokenAddress(
    inputMint,
    payerPubkey,
    baseTokenProgram
  );
  const feeRecipientPk = pumpFunFeeRecipientMeta(
    protocolParams.feeRecipient,
    bondingCurve.isMayhemMode
  );
  const buybackFeeRecipient = protocolParams.buybackFeeRecipient ?? getPumpFunBuybackFeeRecipientRandom();
  const associatedQuoteFeeRecipient = associatedTokenAddress(
    quoteMint,
    feeRecipientPk,
    quoteTokenProgram
  );
  const associatedQuoteBuybackFeeRecipient = associatedTokenAddress(
    quoteMint,
    buybackFeeRecipient,
    quoteTokenProgram
  );
  const associatedQuoteBondingCurve = associatedTokenAddress(
    quoteMint,
    bondingCurveAddr,
    quoteTokenProgram
  );
  const associatedQuoteUser = associatedTokenAddress(
    quoteMint,
    payerPubkey,
    quoteTokenProgram
  );
  const associatedCreatorVault = associatedTokenAddress(
    quoteMint,
    creatorVaultAccount,
    quoteTokenProgram
  );
  const sharingConfig = getPumpFunFeeSharingConfigPda(inputMint);
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payerPubkey);
  const associatedUserVolumeAccumulator = associatedTokenAddress(
    quoteMint,
    userVolumeAccumulator,
    quoteTokenProgram
  );
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        associatedQuoteUser,
        payerPubkey,
        quoteMint,
        quoteTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }
  const minSolOutput = params.minimumOutputAmount ?? fixedOutputAmount ?? calculateWithSlippageSell(
    getSellSolAmountFromTokenAmount(inputAmount, bondingCurve, creator),
    slippageBasisPoints
  );
  const data = Buffer3.alloc(24);
  PUMPFUN_SELL_V2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minSolOutput, 16);
  const keys = [
    { pubkey: PUMPFUN_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false
    },
    { pubkey: feeRecipientPk, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteFeeRecipient, isSigner: false, isWritable: true },
    { pubkey: buybackFeeRecipient, isSigner: false, isWritable: true },
    {
      pubkey: associatedQuoteBuybackFeeRecipient,
      isSigner: false,
      isWritable: true
    },
    { pubkey: bondingCurveAddr, isSigner: false, isWritable: true },
    { pubkey: associatedBaseBondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteBondingCurve, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: associatedBaseUser, isSigner: false, isWritable: true },
    { pubkey: associatedQuoteUser, isSigner: false, isWritable: true },
    { pubkey: creatorVaultAccount, isSigner: false, isWritable: true },
    { pubkey: associatedCreatorVault, isSigner: false, isWritable: true },
    { pubkey: sharingConfig, isSigner: false, isWritable: false },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    {
      pubkey: associatedUserVolumeAccumulator,
      isSigner: false,
      isWritable: true
    },
    { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction2({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta || protocolParams.closeTokenAccountWhenSell) {
    instructions.push(
      createCloseAccountInstruction(
        associatedBaseUser,
        payerPubkey,
        payerPubkey,
        [],
        baseTokenProgram
      )
    );
  }
  return instructions;
}
function buildPumpFunClaimCashbackInstruction(payer) {
  const userVolumeAccumulator = getPumpFunUserVolumeAccumulatorPda(payer);
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: SystemProgram2.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  return new TransactionInstruction2({
    keys,
    programId: PUMPFUN_PROGRAM_ID,
    data: PUMPFUN_CLAIM_CASHBACK_DISCRIMINATOR
  });
}
async function fetchBondingCurveAccount(connection, mint) {
  const bondingCurvePda = getBondingCurvePda(mint);
  const account = await connection.getAccountInfo(bondingCurvePda);
  if (!account?.value?.data || account.value.data.length === 0) {
    return null;
  }
  const data = account.value.data;
  let offset = 8;
  const virtualTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const virtualSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const realTokenReserves = data.readBigUInt64LE(offset);
  offset += 8;
  const realSolReserves = data.readBigUInt64LE(offset);
  offset += 8;
  offset += 8;
  const complete = data.readUInt8(offset) === 1;
  offset += 1;
  const creator = new PublicKey2(data.subarray(offset, offset + 32));
  offset += 32;
  const isMayhemMode = data.readUInt8(offset) === 1;
  offset += 1;
  const isCashbackCoin = data.readUInt8(offset) === 1;
  return {
    bondingCurve: {
      account: bondingCurvePda,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      creator,
      isMayhemMode,
      isCashbackCoin
    },
    bondingCurvePda
  };
}
function getCreator(creatorVaultPda) {
  const defaultBytes = Buffer3.alloc(32);
  if (creatorVaultPda.equals(new PublicKey2(defaultBytes))) {
    return new PublicKey2(defaultBytes);
  }
  const defaultCreatorVault = getCreatorVaultPda(new PublicKey2(defaultBytes));
  if (creatorVaultPda.equals(defaultCreatorVault)) {
    return new PublicKey2(defaultBytes);
  }
  return creatorVaultPda;
}
function getBuyPrice(amount, virtualSolReserves, virtualTokenReserves, realTokenReserves) {
  if (amount === 0n) {
    return 0n;
  }
  const n = virtualSolReserves * virtualTokenReserves;
  const i = virtualSolReserves + amount;
  const r = n / i + 1n;
  const s = virtualTokenReserves - r;
  return s < realTokenReserves ? s : realTokenReserves;
}

// src/instruction/pumpswap.ts
var pumpswap_exports = {};
__export(pumpswap_exports, {
  LEGACY_POOL_SIZE: () => LEGACY_POOL_SIZE,
  POOL_SIZE: () => POOL_SIZE,
  PUMPSWAP_BUY_DISCRIMINATOR: () => PUMPSWAP_BUY_DISCRIMINATOR,
  PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR: () => PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,
  PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR: () => PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR,
  PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY: () => PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY,
  PUMPSWAP_EVENT_AUTHORITY: () => PUMPSWAP_EVENT_AUTHORITY,
  PUMPSWAP_FEE_CONFIG: () => PUMPSWAP_FEE_CONFIG,
  PUMPSWAP_FEE_PROGRAM: () => PUMPSWAP_FEE_PROGRAM,
  PUMPSWAP_FEE_RECIPIENT: () => PUMPSWAP_FEE_RECIPIENT,
  PUMPSWAP_GLOBAL_ACCOUNT: () => PUMPSWAP_GLOBAL_ACCOUNT,
  PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR: () => PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR,
  PUMPSWAP_MAYHEM_FEE_RECIPIENTS: () => PUMPSWAP_MAYHEM_FEE_RECIPIENTS,
  PUMPSWAP_POOL_DISCRIMINATOR: () => PUMPSWAP_POOL_DISCRIMINATOR,
  PUMPSWAP_PROGRAM: () => PUMPSWAP_PROGRAM,
  PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS: () => PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS,
  PUMPSWAP_PUMP_PROGRAM_ID: () => PUMPSWAP_PUMP_PROGRAM_ID,
  PUMPSWAP_SELL_DISCRIMINATOR: () => PUMPSWAP_SELL_DISCRIMINATOR,
  buildBuyInstructions: () => buildBuyInstructions,
  buildClaimCashbackInstruction: () => buildClaimCashbackInstruction,
  buildSellInstructions: () => buildSellInstructions,
  calculateFeeTier: () => calculateFeeTier,
  closeWsol: () => closeWsol,
  computePumpSwapFeeBasisPoints: () => computePumpSwapFeeBasisPoints,
  createAssociatedTokenAccountIdempotent: () => createAssociatedTokenAccountIdempotent,
  decodeFeeConfig: () => decodeFeeConfig,
  decodePool: () => decodePool,
  fetchFeeConfig: () => fetchFeeConfig,
  fetchPool: () => fetchPool,
  findByBaseMint: () => findByBaseMint,
  findByMint: () => findByMint,
  findByQuoteMint: () => findByQuoteMint,
  findPoolByMint: () => findPoolByMint,
  getAssociatedTokenAddress: () => getAssociatedTokenAddress,
  getCanonicalPoolPDA: () => getCanonicalPoolPDA,
  getCoinCreatorVaultAta: () => getCoinCreatorVaultAta,
  getCoinCreatorVaultAuthority: () => getCoinCreatorVaultAuthority,
  getFeeConfigPDA: () => getFeeConfigPDA,
  getFeeRecipientAta: () => getFeeRecipientAta,
  getGlobalVolumeAccumulatorPDA: () => getGlobalVolumeAccumulatorPDA,
  getMayhemFeeRecipientRandom: () => getMayhemFeeRecipientRandom,
  getPoolV2PDA: () => getPoolV2PDA,
  getPumpPoolAuthorityPDA: () => getPumpPoolAuthorityPDA,
  getPumpSwapProtocolExtraFeeRecipientRandom: () => getPumpSwapProtocolExtraFeeRecipientRandom,
  getPumpSwapProtocolFeeRecipientRandom: () => getPumpSwapProtocolFeeRecipientRandom,
  getTokenBalances: () => getTokenBalances,
  getUserVolumeAccumulatorPDA: () => getUserVolumeAccumulatorPDA,
  getUserVolumeAccumulatorQuoteAta: () => getUserVolumeAccumulatorQuoteAta,
  getUserVolumeAccumulatorWsolAta: () => getUserVolumeAccumulatorWsolAta,
  handleWsol: () => handleWsol,
  isCanonicalPumpPool: () => isCanonicalPumpPool,
  poolMarketCapLamports: () => poolMarketCapLamports
});
import { Buffer as Buffer5 } from "buffer";
import {
  PublicKey as PublicKey4,
  TransactionInstruction as TransactionInstruction3,
  SystemProgram as SystemProgram3,
  SYSVAR_RENT_PUBKEY as SYSVAR_RENT_PUBKEY2
} from "@solana/web3.js";

// src/constants/index.ts
var constants_exports = {};
__export(constants_exports, {
  ASSOCIATED_TOKEN_PROGRAM: () => ASSOCIATED_TOKEN_PROGRAM,
  BONK_PROGRAM: () => BONK_PROGRAM,
  CONSTANTS: () => CONSTANTS,
  DEFAULT_COMPUTE_UNITS: () => DEFAULT_COMPUTE_UNITS,
  DEFAULT_PRIORITY_FEE: () => DEFAULT_PRIORITY_FEE,
  DEFAULT_SLIPPAGE: () => DEFAULT_SLIPPAGE,
  DEFAULT_TIP_LAMPORTS: () => DEFAULT_TIP_LAMPORTS,
  METEORA_DAMM_V2_PROGRAM: () => METEORA_DAMM_V2_PROGRAM,
  PUMPFUN_DISCRIMINATORS: () => PUMPFUN_DISCRIMINATORS,
  PUMPFUN_PROGRAM: () => PUMPFUN_PROGRAM,
  PUMPSWAP_DISCRIMINATORS: () => PUMPSWAP_DISCRIMINATORS,
  PUMPSWAP_PROGRAM_ID: () => PUMPSWAP_PROGRAM_ID,
  RAYDIUM_AMM_V4_PROGRAM: () => RAYDIUM_AMM_V4_PROGRAM,
  RAYDIUM_CPMM_PROGRAM: () => RAYDIUM_CPMM_PROGRAM,
  RENT: () => RENT,
  SDK_FEE_RECIPIENT: () => SDK_FEE_RECIPIENT,
  SDK_MAYHEM_FEE_RECIPIENTS: () => SDK_MAYHEM_FEE_RECIPIENTS,
  SOL_TOKEN_ACCOUNT: () => SOL_TOKEN_ACCOUNT2,
  SWQOS_ENDPOINTS: () => SWQOS_ENDPOINTS,
  SYSTEM_PROGRAM: () => SYSTEM_PROGRAM,
  TOKEN_PROGRAM: () => TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022: () => TOKEN_PROGRAM_2022,
  USD1_TOKEN_ACCOUNT: () => USD1_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT: () => USDC_TOKEN_ACCOUNT,
  WSOL_TOKEN_ACCOUNT: () => WSOL_TOKEN_ACCOUNT
});
import { Buffer as Buffer4 } from "buffer";
import { PublicKey as PublicKey3 } from "@solana/web3.js";
var SYSTEM_PROGRAM = new PublicKey3("11111111111111111111111111111111");
var TOKEN_PROGRAM = new PublicKey3(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
var TOKEN_PROGRAM_2022 = new PublicKey3(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);
var SOL_TOKEN_ACCOUNT2 = new PublicKey3(
  "So11111111111111111111111111111111111111111"
);
var WSOL_TOKEN_ACCOUNT = new PublicKey3(
  "So11111111111111111111111111111111111111112"
);
var USD1_TOKEN_ACCOUNT = new PublicKey3(
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"
);
var USDC_TOKEN_ACCOUNT = new PublicKey3(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
var ASSOCIATED_TOKEN_PROGRAM = new PublicKey3(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
var RENT = new PublicKey3(
  "SysvarRent111111111111111111111111111111111"
);
var PUMPFUN_PROGRAM = new PublicKey3(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
var PUMPSWAP_PROGRAM_ID = new PublicKey3(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
var BONK_PROGRAM = new PublicKey3(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
);
var RAYDIUM_CPMM_PROGRAM = new PublicKey3(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);
var RAYDIUM_AMM_V4_PROGRAM = new PublicKey3(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
var METEORA_DAMM_V2_PROGRAM = new PublicKey3(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);
var SDK_FEE_RECIPIENT = new PublicKey3(
  "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4Cs9tM"
);
var SDK_MAYHEM_FEE_RECIPIENTS = [
  new PublicKey3("7VtWHe8WJeU9Sy5j1XF5n8qPzDtJjWxMgYVtJ89AQrVj"),
  new PublicKey3("82jN8eGgPvMSW1KP9W6GdW4bQ3YbB7sGgC6BhZnLVQvR")
];
var PUMPFUN_DISCRIMINATORS = {
  BUY: Buffer4.from([102, 6, 61, 18, 1, 218, 235, 234]),
  SELL: Buffer4.from([51, 230, 133, 164, 1, 127, 131, 173]),
  BUY_EXACT_SOL_IN: Buffer4.from([56, 252, 116, 8, 158, 223, 205, 95]),
  CLAIM_CASHBACK: Buffer4.from([37, 58, 35, 126, 190, 53, 228, 197])
};
var PUMPSWAP_DISCRIMINATORS = {
  SWAP: Buffer4.from([43, 4, 237, 11, 26, 201, 30, 98]),
  DEPOSIT: Buffer4.from([242, 35, 198, 137, 82, 225, 242, 178]),
  WITHDRAW: Buffer4.from([183, 18, 178, 128, 70, 157, 46, 34])
};
var DEFAULT_SLIPPAGE = 500;
var DEFAULT_COMPUTE_UNITS = 2e5;
var DEFAULT_PRIORITY_FEE = 1e5;
var DEFAULT_TIP_LAMPORTS = 1e5;
var CONSTANTS = {
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  SOL_TOKEN_ACCOUNT: SOL_TOKEN_ACCOUNT2,
  WSOL_TOKEN_ACCOUNT,
  USD1_TOKEN_ACCOUNT,
  USDC_TOKEN_ACCOUNT,
  ASSOCIATED_TOKEN_PROGRAM,
  RENT,
  PUMPFUN_PROGRAM,
  PUMPSWAP_PROGRAM: PUMPSWAP_PROGRAM_ID,
  BONK_PROGRAM,
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_AMM_V4_PROGRAM,
  METEORA_DAMM_V2_PROGRAM,
  DEFAULT_SLIPPAGE,
  DEFAULT_COMPUTE_UNITS,
  DEFAULT_PRIORITY_FEE,
  DEFAULT_TIP_LAMPORTS
};
var SWQOS_ENDPOINTS = {
  Jito: {
    Frankfurt: "frankfurt.mainnet.block-engine.jito.wtf",
    NewYork: "amsterdam.mainnet.block-engine.jito.wtf",
    Amsterdam: "amsterdam.mainnet.block-engine.jito.wtf",
    Tokyo: "tokyo.mainnet.block-engine.jito.wtf",
    Singapore: "singapore.mainnet.block-engine.jito.wtf"
  }
  // Add more SWQOS endpoints as needed
};

// src/calc/index.ts
var calc_exports = {};
__export(calc_exports, {
  BONK_CONSTANTS: () => BONK_CONSTANTS,
  CalculationError: () => CalculationError,
  PUMPFUN_CONSTANTS: () => PUMPFUN_CONSTANTS,
  PUMPSWAP_CONSTANTS: () => PUMPSWAP_CONSTANTS,
  buyBaseInputInternal: () => buyBaseInputInternal,
  buyBaseInputInternalWithFees: () => buyBaseInputInternalWithFees,
  buyQuoteInputInternal: () => buyQuoteInputInternal,
  buyQuoteInputInternalWithFees: () => buyQuoteInputInternalWithFees,
  calculatePrice: () => calculatePrice,
  calculatePriceImpact: () => calculatePriceImpact,
  calculateWithSlippageBuy: () => calculateWithSlippageBuy2,
  calculateWithSlippageSell: () => calculateWithSlippageSell2,
  ceilDiv: () => ceilDiv,
  computeFee: () => computeFee,
  computeRaydiumAmmV4SwapAmount: () => computeRaydiumAmmV4SwapAmount,
  computeRaydiumCpmmSwapAmount: () => computeRaydiumCpmmSwapAmount,
  effectiveQuoteReserves: () => effectiveQuoteReserves,
  getBonkAmountIn: () => getBonkAmountIn,
  getBonkAmountOut: () => getBonkAmountOut,
  getBonkBuyTokenAmountFromSolAmount: () => getBonkBuyTokenAmountFromSolAmount,
  getBonkSellSolAmountFromTokenAmount: () => getBonkSellSolAmountFromTokenAmount,
  getBuyTokenAmountFromSolAmount: () => getBuyTokenAmountFromSolAmount2,
  getSellSolAmountFromTokenAmount: () => getSellSolAmountFromTokenAmount2,
  lamportsToSol: () => lamportsToSol,
  legacyPumpSwapFeeBasisPoints: () => legacyPumpSwapFeeBasisPoints,
  meteoraDammV2CalculateLiquidity: () => meteoraDammV2CalculateLiquidity,
  meteoraDammV2CalculatePrice: () => meteoraDammV2CalculatePrice,
  meteoraDammV2ComputeSwapAmount: () => meteoraDammV2ComputeSwapAmount,
  meteoraDammV2GetAmountIn: () => meteoraDammV2GetAmountIn,
  meteoraDammV2GetAmountOut: () => meteoraDammV2GetAmountOut,
  priceBaseInQuoteFromReserves: () => priceBaseInQuoteFromReserves,
  priceBaseInQuoteWithVirtual: () => priceBaseInQuoteWithVirtual,
  priceQuoteInBase: () => priceQuoteInBase,
  priceToken0InToken1: () => priceToken0InToken1,
  priceToken1InToken0: () => priceToken1InToken0,
  priceTokenInSol: () => priceTokenInSol,
  priceTokenInWsol: () => priceTokenInWsol,
  pumpSwapFeeBasisPoints: () => pumpSwapFeeBasisPoints,
  raydiumAmmV4GetAmountIn: () => raydiumAmmV4GetAmountIn,
  raydiumAmmV4GetAmountOut: () => raydiumAmmV4GetAmountOut,
  raydiumCpmmGetAmountOut: () => raydiumCpmmGetAmountOut,
  sellBaseInputInternal: () => sellBaseInputInternal,
  sellBaseInputInternalWithFees: () => sellBaseInputInternalWithFees,
  sellQuoteInputInternal: () => sellQuoteInputInternal,
  sellQuoteInputInternalWithFees: () => sellQuoteInputInternalWithFees
});
var MAX_SAFE_BIGINT = BigInt("18446744073709551615");
var MAX_BASIS_POINTS = BigInt(1e4);
var I128_MIN_BIGINT = -(BigInt(1) << BigInt(127));
var I128_MAX_BIGINT = (BigInt(1) << BigInt(127)) - BigInt(1);
var MAX_SLIPPAGE_BASIS_POINTS = BigInt(9999);
var CalculationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CalculationError";
  }
};
function validateAmount(amount, name = "amount") {
  if (amount < BigInt(0)) {
    throw new CalculationError(`${name} cannot be negative: ${amount}`);
  }
  if (amount > MAX_SAFE_BIGINT) {
    throw new CalculationError(`${name} exceeds maximum safe value: ${amount}`);
  }
}
function validateBasisPoints(basisPoints) {
  if (basisPoints < BigInt(0) || basisPoints > MAX_BASIS_POINTS) {
    throw new CalculationError(
      `Basis points must be between 0 and 10000, got ${basisPoints}`
    );
  }
}
function checkOverflow(a, b, operation) {
  if (operation === "multiply") {
    if (a !== BigInt(0) && b > MAX_SAFE_BIGINT / a) {
      throw new CalculationError(`Multiplication overflow: ${a} * ${b}`);
    }
  } else if (operation === "add") {
    if (a > MAX_SAFE_BIGINT - b) {
      throw new CalculationError(`Addition overflow: ${a} + ${b}`);
    }
  }
}
function computeFee(amount, feeBasisPoints) {
  validateAmount(amount, "amount");
  validateBasisPoints(feeBasisPoints);
  checkOverflow(amount, feeBasisPoints, "multiply");
  return ceilDiv(amount * feeBasisPoints, BigInt(1e4));
}
function ceilDiv(a, b) {
  if (b === BigInt(0)) {
    throw new CalculationError("Division by zero");
  }
  validateAmount(a, "dividend");
  validateAmount(b, "divisor");
  checkOverflow(a, b - BigInt(1), "add");
  return (a + b - BigInt(1)) / b;
}
function calculateWithSlippageBuy2(amount, basisPoints) {
  validateAmount(amount, "amount");
  const bps = basisPoints > MAX_SLIPPAGE_BASIS_POINTS ? MAX_SLIPPAGE_BASIS_POINTS : basisPoints;
  checkOverflow(amount, bps, "multiply");
  const slippageAmount = amount * bps / BigInt(1e4);
  checkOverflow(amount, slippageAmount, "add");
  return amount + slippageAmount;
}
function calculateWithSlippageSell2(amount, basisPoints) {
  validateAmount(amount, "amount");
  validateBasisPoints(basisPoints);
  if (amount <= basisPoints / BigInt(1e4)) {
    return BigInt(1);
  }
  checkOverflow(amount, basisPoints, "multiply");
  const slippageAmount = amount * basisPoints / BigInt(1e4);
  return amount - slippageAmount;
}
var PUMPFUN_CONSTANTS = {
  FEE_BASIS_POINTS: BigInt(95),
  // Protocol fee (NOT 100!)
  CREATOR_FEE: BigInt(30),
  // Creator fee (NOT 50!)
  INITIAL_VIRTUAL_TOKEN_RESERVES: BigInt("1073000000000000"),
  INITIAL_VIRTUAL_SOL_RESERVES: BigInt("30000000000"),
  INITIAL_REAL_TOKEN_RESERVES: BigInt("793100000000000"),
  // Fixed: was 793000000000000
  TOKEN_TOTAL_SUPPLY: BigInt("1000000000000000")
};
function getBuyTokenAmountFromSolAmount2(virtualTokenReserves, virtualSolReserves, realTokenReserves, hasCreator, amount) {
  if (amount === BigInt(0) || virtualTokenReserves === BigInt(0)) {
    return BigInt(0);
  }
  let totalFeeBasisPoints = PUMPFUN_CONSTANTS.FEE_BASIS_POINTS;
  if (hasCreator) {
    totalFeeBasisPoints += PUMPFUN_CONSTANTS.CREATOR_FEE;
  }
  const inputAmount = amount * BigInt(1e4) / (totalFeeBasisPoints + BigInt(1e4));
  const denominator = virtualSolReserves + inputAmount;
  let tokensReceived = inputAmount * virtualTokenReserves / denominator;
  if (tokensReceived > realTokenReserves) {
    tokensReceived = realTokenReserves;
  }
  if (tokensReceived <= BigInt(100) * BigInt(1e6)) {
    if (amount > BigInt(1e7)) {
      tokensReceived = BigInt("25547619000000000");
    } else {
      tokensReceived = BigInt("255476000000000");
    }
  }
  return tokensReceived;
}
function getSellSolAmountFromTokenAmount2(virtualTokenReserves, virtualSolReserves, hasCreator, amount) {
  if (amount === BigInt(0) || virtualTokenReserves === BigInt(0)) {
    return BigInt(0);
  }
  const numerator = amount * virtualSolReserves;
  const denominator = virtualTokenReserves + amount;
  const solCost = numerator / denominator;
  let totalFeeBasisPoints = PUMPFUN_CONSTANTS.FEE_BASIS_POINTS;
  if (hasCreator) {
    totalFeeBasisPoints += PUMPFUN_CONSTANTS.CREATOR_FEE;
  }
  const fee = computeFee(solCost, totalFeeBasisPoints);
  if (solCost < fee) {
    return BigInt(0);
  }
  return solCost - fee;
}
var PUMPSWAP_CONSTANTS = {
  LP_FEE_BASIS_POINTS: BigInt(25),
  // 0.25% (was 20)
  PROTOCOL_FEE_BASIS_POINTS: BigInt(5),
  // 0.05% (was 20)
  COIN_CREATOR_FEE_BASIS_POINTS: BigInt(5)
  // 0.05% (was 10)
};
function pumpSwapFeeBasisPoints(lpFeeBasisPoints, protocolFeeBasisPoints, coinCreatorFeeBasisPoints) {
  return {
    lpFeeBasisPoints,
    protocolFeeBasisPoints,
    coinCreatorFeeBasisPoints
  };
}
function legacyPumpSwapFeeBasisPoints(hasCoinCreator) {
  return pumpSwapFeeBasisPoints(
    PUMPSWAP_CONSTANTS.LP_FEE_BASIS_POINTS,
    PUMPSWAP_CONSTANTS.PROTOCOL_FEE_BASIS_POINTS,
    hasCoinCreator ? PUMPSWAP_CONSTANTS.COIN_CREATOR_FEE_BASIS_POINTS : BigInt(0)
  );
}
function effectiveQuoteReserves(quoteVaultBalance, virtualQuoteReserves) {
  if (quoteVaultBalance < BigInt(0) || quoteVaultBalance > MAX_SAFE_BIGINT) {
    throw new CalculationError(
      `Invalid u64 quote vault balance: ${quoteVaultBalance}`
    );
  }
  if (virtualQuoteReserves < I128_MIN_BIGINT || virtualQuoteReserves > I128_MAX_BIGINT) {
    throw new CalculationError(
      `Invalid signed i128 virtual quote reserves: ${virtualQuoteReserves}`
    );
  }
  const effective = quoteVaultBalance + virtualQuoteReserves;
  if (effective <= BigInt(0) || effective > MAX_SAFE_BIGINT) {
    throw new CalculationError(
      `Invalid effective quote reserves: raw=${quoteVaultBalance}, virtual=${virtualQuoteReserves}`
    );
  }
  return effective;
}
function pumpSwapCeilDiv(value, divisor, name) {
  if (value < BigInt(0) || divisor <= BigInt(0)) {
    throw new CalculationError(`Invalid ${name} division`);
  }
  const result = (value + divisor - BigInt(1)) / divisor;
  if (result > MAX_SAFE_BIGINT) {
    throw new CalculationError(`Calculated ${name} exceeds u64`);
  }
  return result;
}
function buyBaseInputInternal(base, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, hasCoinCreator) {
  return buyBaseInputInternalWithFees(
    base,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}
function buyBaseInputInternalWithFees(base, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, feeBasisPoints) {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error("Invalid input: reserves cannot be zero");
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(
    quoteReserve,
    virtualQuoteReserves
  );
  if (base > baseReserve) {
    throw new Error("Cannot buy more base tokens than pool reserves");
  }
  const numerator = effectiveQuoteReserve * base;
  const denominator = baseReserve - base;
  if (denominator === BigInt(0)) {
    throw new Error("Pool would be depleted");
  }
  const quoteAmountIn = pumpSwapCeilDiv(
    numerator,
    denominator,
    "raw quote amount"
  );
  const lpFee = computeFee(quoteAmountIn, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(
    quoteAmountIn,
    feeBasisPoints.protocolFeeBasisPoints
  );
  const coinCreatorFee = computeFee(
    quoteAmountIn,
    feeBasisPoints.coinCreatorFeeBasisPoints
  );
  const totalQuote = quoteAmountIn + lpFee + protocolFee + coinCreatorFee;
  const maxQuote = calculateWithSlippageBuy2(totalQuote, slippageBasisPoints);
  return {
    internalQuoteAmount: quoteAmountIn,
    uiQuote: totalQuote,
    maxQuote
  };
}
function buyQuoteInputInternal(quote, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, hasCoinCreator) {
  return buyQuoteInputInternalWithFees(
    quote,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}
function buyQuoteInputInternalWithFees(quote, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, feeBasisPoints) {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error("Invalid input: reserves cannot be zero");
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(
    quoteReserve,
    virtualQuoteReserves
  );
  const totalFeeBps = feeBasisPoints.lpFeeBasisPoints + feeBasisPoints.protocolFeeBasisPoints + feeBasisPoints.coinCreatorFeeBasisPoints;
  const denominator = BigInt(1e4) + totalFeeBps;
  let effectiveQuote = quote * BigInt(1e4) / denominator;
  const lpFee = computeFee(effectiveQuote, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(
    effectiveQuote,
    feeBasisPoints.protocolFeeBasisPoints
  );
  const coinCreatorFee = computeFee(
    effectiveQuote,
    feeBasisPoints.coinCreatorFeeBasisPoints
  );
  const totalWithFees = effectiveQuote + lpFee + protocolFee + coinCreatorFee;
  if (totalWithFees > quote) {
    effectiveQuote -= totalWithFees - quote;
    if (effectiveQuote < BigInt(0)) {
      effectiveQuote = BigInt(0);
    }
  }
  const inputAmount = effectiveQuote > BigInt(0) ? effectiveQuote - BigInt(1) : BigInt(0);
  const numerator = baseReserve * inputAmount;
  const denominatorEffective = effectiveQuoteReserve + inputAmount;
  if (denominatorEffective === BigInt(0)) {
    throw new Error("Pool would be depleted");
  }
  const baseAmountOut = numerator / denominatorEffective;
  const maxQuote = calculateWithSlippageBuy2(quote, slippageBasisPoints);
  return {
    base: baseAmountOut,
    internalQuoteWithoutFees: effectiveQuote,
    maxQuote
  };
}
function sellBaseInputInternal(base, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, hasCoinCreator) {
  return sellBaseInputInternalWithFees(
    base,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}
function sellBaseInputInternalWithFees(base, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, feeBasisPoints) {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error("Invalid input: reserves cannot be zero");
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(
    quoteReserve,
    virtualQuoteReserves
  );
  const quoteAmountOut = effectiveQuoteReserve * base / (baseReserve + base);
  const lpFee = computeFee(quoteAmountOut, feeBasisPoints.lpFeeBasisPoints);
  const protocolFee = computeFee(
    quoteAmountOut,
    feeBasisPoints.protocolFeeBasisPoints
  );
  const coinCreatorFee = computeFee(
    quoteAmountOut,
    feeBasisPoints.coinCreatorFeeBasisPoints
  );
  const totalFees = lpFee + protocolFee + coinCreatorFee;
  if (totalFees > quoteAmountOut) {
    throw new Error("Fees exceed output");
  }
  const quoteVaultOutflow = quoteAmountOut - lpFee;
  if (quoteVaultOutflow > quoteReserve) {
    throw new Error(
      "Insufficient real quote reserves to cover the sell output"
    );
  }
  const finalQuote = quoteAmountOut - totalFees;
  const minQuote = calculateWithSlippageSell2(finalQuote, slippageBasisPoints);
  return {
    uiQuote: finalQuote,
    minQuote,
    internalQuoteAmountOut: quoteAmountOut
  };
}
function sellQuoteInputInternal(quote, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, hasCoinCreator) {
  return sellQuoteInputInternalWithFees(
    quote,
    slippageBasisPoints,
    baseReserve,
    quoteReserve,
    virtualQuoteReserves,
    legacyPumpSwapFeeBasisPoints(hasCoinCreator)
  );
}
function sellQuoteInputInternalWithFees(quote, slippageBasisPoints, baseReserve, quoteReserve, virtualQuoteReserves, feeBasisPoints) {
  if (baseReserve === BigInt(0) || quoteReserve === BigInt(0)) {
    throw new Error("Invalid input: reserves cannot be zero");
  }
  if (quote > quoteReserve) {
    throw new Error("Cannot receive more than pool reserves");
  }
  const effectiveQuoteReserve = effectiveQuoteReserves(
    quoteReserve,
    virtualQuoteReserves
  );
  const rawQuote = calculateQuoteAmountOut(
    quote,
    feeBasisPoints.lpFeeBasisPoints,
    feeBasisPoints.protocolFeeBasisPoints,
    feeBasisPoints.coinCreatorFeeBasisPoints
  );
  const lpFee = computeFee(rawQuote, feeBasisPoints.lpFeeBasisPoints);
  const quoteVaultOutflow = rawQuote - lpFee;
  if (quoteVaultOutflow > quoteReserve) {
    throw new Error(
      "Insufficient real quote reserves to cover the sell output"
    );
  }
  if (rawQuote >= effectiveQuoteReserve) {
    throw new Error("Invalid input: desired amount exceeds reserve");
  }
  const baseAmountIn = pumpSwapCeilDiv(
    baseReserve * rawQuote,
    effectiveQuoteReserve - rawQuote,
    "base amount"
  );
  const minQuote = calculateWithSlippageSell2(quote, slippageBasisPoints);
  return {
    internalRawQuote: rawQuote,
    base: baseAmountIn,
    minQuote
  };
}
function calculateQuoteAmountOut(userQuoteAmountOut, lpFeeBasisPoints, protocolFeeBasisPoints, coinCreatorFeeBasisPoints) {
  const totalFeeBasisPoints = lpFeeBasisPoints + protocolFeeBasisPoints + coinCreatorFeeBasisPoints;
  const denominator = BigInt(1e4) - totalFeeBasisPoints;
  if (denominator <= BigInt(0)) {
    throw new Error("Total fee basis points must be less than 10,000");
  }
  return pumpSwapCeilDiv(
    userQuoteAmountOut * BigInt(1e4),
    denominator,
    "quote amount"
  );
}
var BONK_CONSTANTS = {
  PROTOCOL_FEE_RATE: BigInt(25),
  // 0.25%
  PLATFORM_FEE_RATE: BigInt(100),
  // 1%
  SHARE_FEE_RATE: BigInt(0),
  // 0%
  DEFAULT_VIRTUAL_BASE: BigInt("1073025605596382"),
  DEFAULT_VIRTUAL_QUOTE: BigInt("30000852951")
};
function getBonkAmountOut(amountIn, virtualBase, virtualQuote) {
  if (virtualBase === BigInt(0) || virtualQuote === BigInt(0)) {
    return BigInt(0);
  }
  const amountOut = amountIn * virtualQuote / virtualBase;
  return amountOut;
}
function getBonkAmountIn(amountOut, virtualBase, virtualQuote) {
  if (virtualBase === BigInt(0) || virtualQuote === BigInt(0)) {
    return BigInt(0);
  }
  const totalFeeRate = BONK_CONSTANTS.PROTOCOL_FEE_RATE + BONK_CONSTANTS.PLATFORM_FEE_RATE + BONK_CONSTANTS.SHARE_FEE_RATE;
  const amountIn = amountOut * BigInt(1e4) / (BigInt(1e4) - totalFeeRate) * virtualBase / virtualQuote;
  return amountIn;
}
function raydiumAmmV4GetAmountOut(amountIn, inputReserve, outputReserve) {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0)) {
    return BigInt(0);
  }
  const amountInWithFee = amountIn * BigInt(9975);
  const numerator = amountInWithFee * outputReserve;
  const denominator = inputReserve * BigInt(1e4) + amountInWithFee;
  return numerator / denominator;
}
function raydiumAmmV4GetAmountIn(amountOut, inputReserve, outputReserve) {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0) || amountOut >= outputReserve) {
    return BigInt(0);
  }
  const numerator = inputReserve * amountOut * BigInt(1e4);
  const denominator = (outputReserve - amountOut) * BigInt(9975);
  return ceilDiv(numerator, denominator);
}
function raydiumCpmmGetAmountOut(amountIn, inputReserve, outputReserve) {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0)) {
    return BigInt(0);
  }
  const amountOut = amountIn * outputReserve / (inputReserve + amountIn);
  return amountOut;
}
function meteoraDammV2ComputeSwapAmount(tokenAReserve, tokenBReserve, isAToB, amountIn, slippageBasisPoints) {
  if (amountIn === BigInt(0)) {
    return { amountOut: BigInt(0), minAmountOut: BigInt(0) };
  }
  let amountOut;
  if (isAToB) {
    if (tokenAReserve === BigInt(0)) {
      return { amountOut: BigInt(0), minAmountOut: BigInt(0) };
    }
    const numerator = tokenBReserve * amountIn;
    const denominator = tokenAReserve + amountIn;
    if (denominator === BigInt(0)) {
      return { amountOut: BigInt(0), minAmountOut: BigInt(0) };
    }
    amountOut = numerator / denominator;
  } else {
    if (tokenBReserve === BigInt(0)) {
      return { amountOut: BigInt(0), minAmountOut: BigInt(0) };
    }
    const numerator = tokenAReserve * amountIn;
    const denominator = tokenBReserve + amountIn;
    if (denominator === BigInt(0)) {
      return { amountOut: BigInt(0), minAmountOut: BigInt(0) };
    }
    amountOut = numerator / denominator;
  }
  const minAmountOut = calculateWithSlippageSell2(
    amountOut,
    slippageBasisPoints
  );
  return { amountOut, minAmountOut };
}
function meteoraDammV2CalculatePrice(tokenAReserve, tokenBReserve) {
  if (tokenAReserve === BigInt(0)) {
    return 0;
  }
  return Number(tokenBReserve) / Number(tokenAReserve);
}
function meteoraDammV2CalculateLiquidity(tokenAReserve, tokenBReserve) {
  if (tokenAReserve === BigInt(0) || tokenBReserve === BigInt(0)) {
    return BigInt(0);
  }
  return BigInt(
    Math.floor(Math.sqrt(Number(tokenAReserve) * Number(tokenBReserve)))
  );
}
function meteoraDammV2GetAmountOut(amountIn, inputReserve, outputReserve, feeBasisPoints) {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0) || amountIn === BigInt(0)) {
    return BigInt(0);
  }
  const amountInAfterFee = amountIn * (BigInt(1e4) - feeBasisPoints) / BigInt(1e4);
  const numerator = amountInAfterFee * outputReserve;
  const denominator = inputReserve + amountInAfterFee;
  return numerator / denominator;
}
function meteoraDammV2GetAmountIn(amountOut, inputReserve, outputReserve, feeBasisPoints) {
  if (inputReserve === BigInt(0) || outputReserve === BigInt(0) || amountOut >= outputReserve) {
    return BigInt(0);
  }
  const numerator = inputReserve * amountOut * BigInt(1e4);
  const denominator = (outputReserve - amountOut) * (BigInt(1e4) - feeBasisPoints);
  return ceilDiv(numerator, denominator);
}
function calculatePriceImpact(reserveIn, amountIn) {
  if (reserveIn === BigInt(0)) {
    return 0;
  }
  return Number(amountIn * BigInt(1e4) / reserveIn) / 100;
}
function calculatePrice(quoteReserve, baseReserve, quoteDecimals, baseDecimals) {
  if (baseReserve === BigInt(0)) {
    return 0;
  }
  const quoteAdjusted = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  const baseAdjusted = Number(baseReserve) / Math.pow(10, baseDecimals);
  return quoteAdjusted / baseAdjusted;
}
function lamportsToSol(lamports) {
  return Number(lamports) / 1e9;
}
var DEFAULT_TOKEN_DECIMALS = 6;
var SOL_DECIMALS = 9;
function priceTokenInWsol(virtualBase, virtualQuote, realBase, realQuote) {
  return priceBaseInQuoteWithVirtual(
    virtualBase,
    virtualQuote,
    realBase,
    realQuote,
    DEFAULT_TOKEN_DECIMALS,
    SOL_DECIMALS
  );
}
function priceBaseInQuoteWithVirtual(virtualBase, virtualQuote, realBase, realQuote, baseDecimals, quoteDecimals) {
  const decimalDiff = quoteDecimals - baseDecimals;
  const decimalFactor = decimalDiff >= 0 ? Math.pow(10, decimalDiff) : 1 / Math.pow(10, -decimalDiff);
  const quoteReserves = virtualQuote + realQuote;
  const baseReserves = virtualBase > realBase ? virtualBase - realBase : BigInt(0);
  if (baseReserves === BigInt(0)) {
    return 0;
  }
  if (decimalFactor === 0) {
    return 0;
  }
  const price = Number(quoteReserves) / Number(baseReserves) / decimalFactor;
  return price;
}
function priceBaseInQuoteFromReserves(baseReserve, quoteReserve, baseDecimals, quoteDecimals) {
  const base = Number(baseReserve) / Math.pow(10, baseDecimals);
  const quote = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  if (base === 0) {
    return 0;
  }
  return quote / base;
}
function priceQuoteInBase(baseReserve, quoteReserve, baseDecimals, quoteDecimals) {
  const base = Number(baseReserve) / Math.pow(10, baseDecimals);
  const quote = Number(quoteReserve) / Math.pow(10, quoteDecimals);
  if (quote === 0) {
    return 0;
  }
  return base / quote;
}
var LAMPORTS_PER_SOL = 1e9;
var SCALE = 1e6;
function priceTokenInSol(virtualSolReserves, virtualTokenReserves) {
  const vSol = Number(virtualSolReserves) / LAMPORTS_PER_SOL;
  const vTokens = Number(virtualTokenReserves) / SCALE;
  if (vTokens === 0) {
    return 0;
  }
  return vSol / vTokens;
}
function getBonkBuyTokenAmountFromSolAmount(amountIn, virtualBase, virtualQuote, realBase, realQuote, slippageBasisPoints) {
  const amountInU128 = amountIn;
  const PROTOCOL_FEE_RATE = BigInt(25);
  const PLATFORM_FEE_RATE = BigInt(100);
  const SHARE_FEE_RATE = BigInt(0);
  const protocolFee = amountInU128 * PROTOCOL_FEE_RATE / BigInt(1e4);
  const platformFee = amountInU128 * PLATFORM_FEE_RATE / BigInt(1e4);
  const shareFee = amountInU128 * SHARE_FEE_RATE / BigInt(1e4);
  const amountInNet = amountInU128 - protocolFee - platformFee - shareFee;
  const inputReserve = virtualQuote + realQuote;
  const outputReserve = virtualBase - realBase;
  const numerator = amountInNet * outputReserve;
  const denominator = inputReserve + amountInNet;
  let amountOut = numerator / denominator;
  amountOut = amountOut - amountOut * slippageBasisPoints / BigInt(1e4);
  return amountOut;
}
function getBonkSellSolAmountFromTokenAmount(amountIn, virtualBase, virtualQuote, realBase, realQuote, slippageBasisPoints) {
  const amountInU128 = amountIn;
  const inputReserve = virtualBase - realBase;
  const outputReserve = virtualQuote + realQuote;
  const numerator = amountInU128 * outputReserve;
  const denominator = inputReserve + amountInU128;
  const solAmountOut = numerator / denominator;
  const PROTOCOL_FEE_RATE = BigInt(25);
  const PLATFORM_FEE_RATE = BigInt(100);
  const SHARE_FEE_RATE = BigInt(0);
  const protocolFee = solAmountOut * PROTOCOL_FEE_RATE / BigInt(1e4);
  const platformFee = solAmountOut * PLATFORM_FEE_RATE / BigInt(1e4);
  const shareFee = solAmountOut * SHARE_FEE_RATE / BigInt(1e4);
  const solAmountNet = solAmountOut - protocolFee - platformFee - shareFee;
  const finalAmount = solAmountNet - solAmountNet * slippageBasisPoints / BigInt(1e4);
  return finalAmount;
}
var RAYDIUM_CPMM_FEE_RATE_DENOMINATOR = BigInt(1e6);
var RAYDIUM_CPMM_TRADE_FEE_RATE = BigInt(2500);
var RAYDIUM_CPMM_CREATOR_FEE_RATE = BigInt(0);
var RAYDIUM_CPMM_PROTOCOL_FEE_RATE = BigInt(12e4);
var RAYDIUM_CPMM_FUND_FEE_RATE = BigInt(4e4);
function computeRaydiumCpmmTradingFee(amount, feeRate) {
  const numerator = amount * feeRate;
  return (numerator + RAYDIUM_CPMM_FEE_RATE_DENOMINATOR - BigInt(1)) / RAYDIUM_CPMM_FEE_RATE_DENOMINATOR;
}
function computeRaydiumCpmmProtocolFundFee(amount, feeRate) {
  const numerator = amount * feeRate;
  return numerator / RAYDIUM_CPMM_FEE_RATE_DENOMINATOR;
}
function computeRaydiumCpmmSwapAmount(baseReserve, quoteReserve, isBaseIn, amountIn, slippageBasisPoints) {
  const [inputReserve, outputReserve] = isBaseIn ? [baseReserve, quoteReserve] : [quoteReserve, baseReserve];
  const tradeFee = computeRaydiumCpmmTradingFee(
    amountIn,
    RAYDIUM_CPMM_TRADE_FEE_RATE
  );
  const inputAmountLessFees = amountIn - tradeFee;
  const protocolFee = computeRaydiumCpmmProtocolFundFee(
    tradeFee,
    RAYDIUM_CPMM_PROTOCOL_FEE_RATE
  );
  const fundFee = computeRaydiumCpmmProtocolFundFee(
    tradeFee,
    RAYDIUM_CPMM_FUND_FEE_RATE
  );
  const outputAmountSwapped = outputReserve * inputAmountLessFees / (inputReserve + inputAmountLessFees);
  const outputAmount = outputAmountSwapped;
  const minAmountOut = outputAmount - outputAmount * slippageBasisPoints / BigInt(1e4);
  const allTrade = true;
  return {
    allTrade,
    amountIn,
    amountOut: outputAmount,
    minAmountOut,
    fee: tradeFee
  };
}
var RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR = BigInt(25);
var RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR = BigInt(1e4);
var RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR = BigInt(25);
var RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR = BigInt(1e4);
function computeRaydiumAmmV4SwapAmount(baseReserve, quoteReserve, isBaseIn, amountIn, slippageBasisPoints) {
  const [inputReserve, outputReserve] = isBaseIn ? [baseReserve, quoteReserve] : [quoteReserve, baseReserve];
  const tradeFeeNumerator = amountIn * RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR;
  const tradeFee = (tradeFeeNumerator + RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR - BigInt(1)) / RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR;
  const inputAmountLessFees = amountIn - tradeFee;
  const swapFeeNumerator = tradeFee * RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR;
  const swapFee = swapFeeNumerator / RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR;
  const outputAmountSwapped = outputReserve * inputAmountLessFees / (inputReserve + inputAmountLessFees);
  const outputAmount = outputAmountSwapped - swapFee;
  const minAmountOut = outputAmount - outputAmount * slippageBasisPoints / BigInt(1e4);
  return {
    allTrade: true,
    amountIn,
    amountOut: outputAmount,
    minAmountOut,
    fee: tradeFee
  };
}
function priceToken0InToken1(sqrtPriceX64, decimalsToken0, decimalsToken1) {
  const sqrtPrice = Number(sqrtPriceX64) / Math.pow(2, 64);
  const priceRaw = sqrtPrice * sqrtPrice;
  const scale = Math.pow(10, decimalsToken0 - decimalsToken1);
  return priceRaw * scale;
}
function priceToken1InToken0(sqrtPriceX64, decimalsToken0, decimalsToken1) {
  return 1 / priceToken0InToken1(sqrtPriceX64, decimalsToken0, decimalsToken1);
}

// src/instruction/pumpswap.ts
var PUMPSWAP_PROGRAM = new PublicKey4(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
var PUMPSWAP_PUMP_PROGRAM_ID = new PublicKey4(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
var PUMPSWAP_FEE_PROGRAM = new PublicKey4(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);
var PUMPSWAP_FEE_RECIPIENT = new PublicKey4(
  "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"
);
var PUMPSWAP_GLOBAL_ACCOUNT = new PublicKey4(
  "ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw"
);
var PUMPSWAP_EVENT_AUTHORITY = new PublicKey4(
  "GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR"
);
var PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR = new PublicKey4(
  "C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw"
);
var PUMPSWAP_FEE_CONFIG = new PublicKey4(
  "5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx"
);
var PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY = new PublicKey4(
  "8N3GDaZ2iwN65oxVatKTLPNooAVUJTbfiVJ1ahyqwjSk"
);
var PUMPSWAP_MAYHEM_FEE_RECIPIENTS = [
  new PublicKey4("GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS"),
  new PublicKey4("4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6"),
  new PublicKey4("8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR"),
  new PublicKey4("4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH"),
  new PublicKey4("8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6"),
  new PublicKey4("Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk"),
  new PublicKey4("463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq"),
  new PublicKey4("6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA")
];
var PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS = [
  new PublicKey4("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD"),
  new PublicKey4("9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7"),
  new PublicKey4("GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL"),
  new PublicKey4("3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR"),
  new PublicKey4("5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6"),
  new PublicKey4("EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL"),
  new PublicKey4("5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD"),
  new PublicKey4("A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW")
];
var PUMPSWAP_BUY_DISCRIMINATOR = Buffer5.from([
  102,
  6,
  61,
  18,
  1,
  218,
  235,
  234
]);
var PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR = Buffer5.from([
  198,
  46,
  21,
  82,
  180,
  217,
  232,
  112
]);
var PUMPSWAP_SELL_DISCRIMINATOR = Buffer5.from([
  51,
  230,
  133,
  164,
  1,
  127,
  131,
  173
]);
var PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR = Buffer5.from([
  37,
  58,
  35,
  126,
  190,
  53,
  228,
  197
]);
var PUMPSWAP_POOL_DISCRIMINATOR = Buffer5.from([
  241,
  154,
  109,
  4,
  17,
  177,
  109,
  188
]);
var POOL_V2_SEED = Buffer5.from("pool-v2");
var POOL_SEED = Buffer5.from("pool");
var POOL_AUTHORITY_SEED = Buffer5.from("pool-authority");
var USER_VOLUME_ACCUMULATOR_SEED = Buffer5.from("user_volume_accumulator");
var CREATOR_VAULT_SEED = Buffer5.from("creator_vault");
var FEE_CONFIG_SEED = Buffer5.from("fee_config");
var GLOBAL_VOLUME_ACCUMULATOR_SEED = Buffer5.from("global_volume_accumulator");
function getMayhemFeeRecipientRandom() {
  const index = Math.floor(
    Math.random() * PUMPSWAP_MAYHEM_FEE_RECIPIENTS.length
  );
  const recipient = PUMPSWAP_MAYHEM_FEE_RECIPIENTS[index];
  if (!recipient) {
    return PUMPSWAP_MAYHEM_FEE_RECIPIENTS[0];
  }
  return recipient;
}
function getPumpSwapProtocolFeeRecipientRandom() {
  return PUMPSWAP_FEE_RECIPIENT;
}
function getPumpSwapProtocolExtraFeeRecipientRandom() {
  const index = Math.floor(
    Math.random() * PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS.length
  );
  return PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS[index] ?? PUMPSWAP_PROTOCOL_EXTRA_FEE_RECIPIENTS[0];
}
function getPoolV2PDA(baseMint) {
  const [pda] = PublicKey4.findProgramAddressSync(
    [POOL_V2_SEED, baseMint.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
function getPumpPoolAuthorityPDA(mint) {
  const [pda] = PublicKey4.findProgramAddressSync(
    [POOL_AUTHORITY_SEED, mint.toBuffer()],
    PUMPSWAP_PUMP_PROGRAM_ID
  );
  return pda;
}
function getCanonicalPoolPDA(mint) {
  const authority = getPumpPoolAuthorityPDA(mint);
  const index = Buffer5.alloc(2);
  index.writeUInt16LE(0);
  const [pda] = PublicKey4.findProgramAddressSync(
    [
      POOL_SEED,
      index,
      authority.toBuffer(),
      mint.toBuffer(),
      WSOL_TOKEN_ACCOUNT.toBuffer()
    ],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
function getCoinCreatorVaultAuthority(coinCreator) {
  const [pda] = PublicKey4.findProgramAddressSync(
    [CREATOR_VAULT_SEED, coinCreator.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
function getCoinCreatorVaultAta(coinCreator, quoteMint, quoteTokenProgram = TOKEN_PROGRAM) {
  const authority = getCoinCreatorVaultAuthority(coinCreator);
  return getAssociatedTokenAddress(authority, quoteMint, quoteTokenProgram);
}
function getFeeRecipientAta(feeRecipient, quoteMint, quoteTokenProgram = TOKEN_PROGRAM) {
  return getAssociatedTokenAddress(feeRecipient, quoteMint, quoteTokenProgram);
}
function getUserVolumeAccumulatorPDA(user) {
  const [pda] = PublicKey4.findProgramAddressSync(
    [USER_VOLUME_ACCUMULATOR_SEED, user.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
function getUserVolumeAccumulatorWsolAta(user) {
  const accumulator = getUserVolumeAccumulatorPDA(user);
  return getAssociatedTokenAddress(
    accumulator,
    WSOL_TOKEN_ACCOUNT,
    TOKEN_PROGRAM
  );
}
function getUserVolumeAccumulatorQuoteAta(user, quoteMint, quoteTokenProgram) {
  const accumulator = getUserVolumeAccumulatorPDA(user);
  return getAssociatedTokenAddress(accumulator, quoteMint, quoteTokenProgram);
}
function getGlobalVolumeAccumulatorPDA() {
  const [pda] = PublicKey4.findProgramAddressSync(
    [GLOBAL_VOLUME_ACCUMULATOR_SEED],
    PUMPSWAP_PROGRAM
  );
  return pda;
}
function getAssociatedTokenAddress(owner, mint, tokenProgram = TOKEN_PROGRAM) {
  const [ata] = PublicKey4.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return ata;
}
function handleWsol(owner, amount) {
  const wsolAta = getAssociatedTokenAddress(
    owner,
    WSOL_TOKEN_ACCOUNT,
    TOKEN_PROGRAM
  );
  const instructions = [];
  instructions.push(
    createAssociatedTokenAccountIdempotent(
      owner,
      owner,
      WSOL_TOKEN_ACCOUNT,
      TOKEN_PROGRAM
    )
  );
  instructions.push(
    SystemProgram3.transfer({
      fromPubkey: owner,
      toPubkey: wsolAta,
      lamports: Number(amount)
    })
  );
  instructions.push(
    new TransactionInstruction3({
      keys: [{ pubkey: wsolAta, isSigner: false, isWritable: true }],
      programId: TOKEN_PROGRAM,
      data: Buffer5.from([17])
      // sync_native discriminator
    })
  );
  return instructions;
}
function handleWsolForMint(owner, mint, tokenProgram, amount) {
  if (mint.equals(WSOL_TOKEN_ACCOUNT)) {
    return handleWsol(owner, amount);
  }
  return [
    createAssociatedTokenAccountIdempotent(owner, owner, mint, tokenProgram)
  ];
}
function closeWsol(owner) {
  const wsolAta = getAssociatedTokenAddress(
    owner,
    WSOL_TOKEN_ACCOUNT,
    TOKEN_PROGRAM
  );
  return new TransactionInstruction3({
    keys: [
      { pubkey: wsolAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    programId: TOKEN_PROGRAM,
    data: Buffer5.from([9])
    // close_account discriminator
  });
}
function closeWsolForMint(owner, mint, tokenProgram) {
  if (!mint.equals(WSOL_TOKEN_ACCOUNT)) {
    return void 0;
  }
  const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);
  return new TransactionInstruction3({
    keys: [
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    programId: tokenProgram,
    data: Buffer5.from([9])
  });
}
function createAssociatedTokenAccountIdempotent(payer, owner, mint, tokenProgram = TOKEN_PROGRAM) {
  const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);
  return new TransactionInstruction3({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram3.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY2, isSigner: false, isWritable: false }
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM,
    data: Buffer5.from([1])
    // Idempotent discriminator
  });
}
function getEffectiveFeeBasisPoints(protocolParams) {
  const hasCoinCreator = protocolParams.coinCreator === void 0 ? !protocolParams.coinCreatorVaultAuthority.equals(
    PUMPSWAP_DEFAULT_COIN_CREATOR_VAULT_AUTHORITY
  ) : !protocolParams.coinCreator.equals(PublicKey4.default);
  const cashbackFeeBasisPoints = protocolParams.cashbackFeeBasisPoints ?? BigInt(0);
  if (protocolParams.feeBasisPoints) {
    return pumpSwapFeeBasisPoints(
      protocolParams.feeBasisPoints.lpFeeBasisPoints,
      protocolParams.feeBasisPoints.protocolFeeBasisPoints,
      (hasCoinCreator ? protocolParams.feeBasisPoints.coinCreatorFeeBasisPoints : BigInt(0)) + cashbackFeeBasisPoints
    );
  }
  const fallback = legacyPumpSwapFeeBasisPoints(hasCoinCreator);
  return pumpSwapFeeBasisPoints(
    fallback.lpFeeBasisPoints,
    fallback.protocolFeeBasisPoints,
    fallback.coinCreatorFeeBasisPoints + cashbackFeeBasisPoints
  );
}
function buildBuyInstructions(params) {
  const {
    payer,
    inputAmount,
    slippageBasisPoints,
    protocolParams,
    createInputMintAta = false,
    closeInputMintAta = false,
    createOutputMintAta = true,
    useExactQuoteAmount = true,
    fixedOutputAmount
  } = params;
  if (inputAmount === 0n) {
    throw new Error("Amount cannot be zero");
  }
  const {
    pool,
    baseMint,
    quoteMint,
    poolBaseTokenAccount,
    poolQuoteTokenAccount,
    poolBaseTokenReserves,
    poolQuoteTokenReserves,
    virtualQuoteReserves,
    coinCreatorVaultAta,
    coinCreatorVaultAuthority,
    baseTokenProgram,
    quoteTokenProgram,
    isMayhemMode,
    isCashbackCoin
  } = protocolParams;
  effectiveQuoteReserves(poolQuoteTokenReserves, virtualQuoteReserves);
  const isWsol = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || baseMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = quoteMint.equals(USDC_TOKEN_ACCOUNT) || baseMint.equals(USDC_TOKEN_ACCOUNT);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const quoteIsWsolOrUsdc = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);
  const inputStableMint = quoteIsWsolOrUsdc ? quoteMint : baseMint;
  const inputStableTokenProgram = quoteIsWsolOrUsdc ? quoteTokenProgram : baseTokenProgram;
  const outputTradeMint = quoteIsWsolOrUsdc ? baseMint : quoteMint;
  const outputTradeTokenProgram = quoteIsWsolOrUsdc ? baseTokenProgram : quoteTokenProgram;
  const feeBasisPoints = getEffectiveFeeBasisPoints(protocolParams);
  let tokenAmount;
  let solAmount;
  if (params.minimumOutputAmount !== void 0) {
    if (fixedOutputAmount !== void 0 || !useExactQuoteAmount || !quoteIsWsolOrUsdc) {
      throw new Error("minimumOutputAmount requires exact quote-input buy");
    }
    tokenAmount = params.minimumOutputAmount;
    solAmount = inputAmount;
  } else if (quoteIsWsolOrUsdc) {
    const result = buyQuoteInputInternalWithFees(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      virtualQuoteReserves,
      feeBasisPoints
    );
    tokenAmount = result.base;
    solAmount = result.maxQuote;
  } else {
    const result = sellBaseInputInternalWithFees(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      virtualQuoteReserves,
      feeBasisPoints
    );
    tokenAmount = result.minQuote;
    solAmount = inputAmount;
  }
  if (fixedOutputAmount !== void 0) {
    tokenAmount = fixedOutputAmount;
  }
  const userBaseTokenAccount = getAssociatedTokenAddress(
    payer,
    baseMint,
    baseTokenProgram
  );
  const userQuoteTokenAccount = getAssociatedTokenAddress(
    payer,
    quoteMint,
    quoteTokenProgram
  );
  const feeRecipient = protocolParams.feeRecipient ?? (isMayhemMode ? getMayhemFeeRecipientRandom() : getPumpSwapProtocolFeeRecipientRandom());
  const feeRecipientAta = getFeeRecipientAta(
    feeRecipient,
    quoteMint,
    quoteTokenProgram
  );
  const instructions = [];
  if (createInputMintAta) {
    const wrapAmount = useExactQuoteAmount ? inputAmount : solAmount;
    instructions.push(
      ...handleWsolForMint(
        payer,
        inputStableMint,
        inputStableTokenProgram,
        wrapAmount
      )
    );
  }
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotent(
        payer,
        payer,
        outputTradeMint,
        outputTradeTokenProgram
      )
    );
  }
  const accounts = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: PUMPSWAP_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: feeRecipient, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram3.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
    { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false }
  ];
  if (quoteIsWsolOrUsdc) {
    accounts.push({
      pubkey: PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR,
      isSigner: false,
      isWritable: false
    });
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push({
      pubkey: userVolumeAccumulator,
      isSigner: false,
      isWritable: true
    });
  }
  accounts.push(
    { pubkey: PUMPSWAP_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_FEE_PROGRAM, isSigner: false, isWritable: false }
  );
  if (isCashbackCoin) {
    const wsolAta = getUserVolumeAccumulatorQuoteAta(
      payer,
      quoteMint,
      quoteTokenProgram
    );
    accounts.push({ pubkey: wsolAta, isSigner: false, isWritable: true });
  }
  if (protocolParams.coinCreator === void 0 || !protocolParams.coinCreator.equals(PublicKey4.default)) {
    const poolV2 = getPoolV2PDA(baseMint);
    accounts.push({ pubkey: poolV2, isSigner: false, isWritable: false });
  }
  const protocolExtraFee = protocolParams.buybackFeeRecipient ?? getPumpSwapProtocolExtraFeeRecipientRandom();
  accounts.push({
    pubkey: protocolExtraFee,
    isSigner: false,
    isWritable: false
  });
  accounts.push({
    pubkey: getFeeRecipientAta(protocolExtraFee, quoteMint, quoteTokenProgram),
    isSigner: false,
    isWritable: true
  });
  const trackVolume = params.trackVolume === false ? 0 : 1;
  let data;
  if (fixedOutputAmount !== void 0) {
    data = Buffer5.alloc(25);
    PUMPSWAP_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(solAmount, 16);
    data[24] = trackVolume;
  } else if (quoteIsWsolOrUsdc && useExactQuoteAmount) {
    const minBaseAmountOut = params.minimumOutputAmount ?? calculateWithSlippageSell2(tokenAmount, slippageBasisPoints);
    data = Buffer5.alloc(25);
    PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(inputAmount, 8);
    data.writeBigUInt64LE(minBaseAmountOut, 16);
    data[24] = trackVolume;
  } else if (quoteIsWsolOrUsdc) {
    data = Buffer5.alloc(25);
    PUMPSWAP_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(solAmount, 16);
    data[24] = trackVolume;
  } else {
    data = Buffer5.alloc(24);
    PUMPSWAP_SELL_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(solAmount, 8);
    data.writeBigUInt64LE(tokenAmount, 16);
  }
  instructions.push(
    new TransactionInstruction3({
      keys: accounts,
      programId: PUMPSWAP_PROGRAM,
      data
    })
  );
  if (closeInputMintAta) {
    const closeInstruction = closeWsolForMint(
      payer,
      inputStableMint,
      inputStableTokenProgram
    );
    if (closeInstruction) instructions.push(closeInstruction);
  }
  return instructions;
}
function buildSellInstructions(params) {
  const {
    payer,
    inputAmount,
    slippageBasisPoints,
    protocolParams,
    createOutputMintAta = false,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    fixedOutputAmount
  } = params;
  if (inputAmount === 0n) {
    throw new Error("Amount cannot be zero");
  }
  const {
    pool,
    baseMint,
    quoteMint,
    poolBaseTokenAccount,
    poolQuoteTokenAccount,
    poolBaseTokenReserves,
    poolQuoteTokenReserves,
    virtualQuoteReserves,
    coinCreatorVaultAta,
    coinCreatorVaultAuthority,
    baseTokenProgram,
    quoteTokenProgram,
    isMayhemMode,
    isCashbackCoin
  } = protocolParams;
  effectiveQuoteReserves(poolQuoteTokenReserves, virtualQuoteReserves);
  const isWsol = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || baseMint.equals(WSOL_TOKEN_ACCOUNT);
  const isUsdc = quoteMint.equals(USDC_TOKEN_ACCOUNT) || baseMint.equals(USDC_TOKEN_ACCOUNT);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const quoteIsWsolOrUsdc = quoteMint.equals(WSOL_TOKEN_ACCOUNT) || quoteMint.equals(USDC_TOKEN_ACCOUNT);
  const outputStableMint = quoteIsWsolOrUsdc ? quoteMint : baseMint;
  const outputStableTokenProgram = quoteIsWsolOrUsdc ? quoteTokenProgram : baseTokenProgram;
  const feeBasisPoints = getEffectiveFeeBasisPoints(protocolParams);
  let tokenAmount;
  let solAmount;
  if (params.minimumOutputAmount !== void 0) {
    if (fixedOutputAmount !== void 0 || !quoteIsWsolOrUsdc) {
      throw new Error("minimumOutputAmount requires exact base-input sell");
    }
    tokenAmount = inputAmount;
    solAmount = params.minimumOutputAmount;
  } else if (quoteIsWsolOrUsdc) {
    tokenAmount = inputAmount;
    const result = sellBaseInputInternalWithFees(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      virtualQuoteReserves,
      feeBasisPoints
    );
    solAmount = result.minQuote;
  } else {
    const result = buyQuoteInputInternalWithFees(
      inputAmount,
      slippageBasisPoints,
      poolBaseTokenReserves,
      poolQuoteTokenReserves,
      virtualQuoteReserves,
      feeBasisPoints
    );
    tokenAmount = result.maxQuote;
    solAmount = result.base;
  }
  if (fixedOutputAmount !== void 0) {
    solAmount = fixedOutputAmount;
  }
  const userBaseTokenAccount = getAssociatedTokenAddress(
    payer,
    baseMint,
    baseTokenProgram
  );
  const userQuoteTokenAccount = getAssociatedTokenAddress(
    payer,
    quoteMint,
    quoteTokenProgram
  );
  const feeRecipient = protocolParams.feeRecipient ?? (isMayhemMode ? getMayhemFeeRecipientRandom() : getPumpSwapProtocolFeeRecipientRandom());
  const feeRecipientAta = getFeeRecipientAta(
    feeRecipient,
    quoteMint,
    quoteTokenProgram
  );
  const instructions = [];
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotent(
        payer,
        payer,
        outputStableMint,
        outputStableTokenProgram
      )
    );
  }
  const accounts = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: PUMPSWAP_GLOBAL_ACCOUNT, isSigner: false, isWritable: false },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: feeRecipient, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: baseTokenProgram, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram3.programId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
    { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false }
  ];
  if (!quoteIsWsolOrUsdc) {
    accounts.push({
      pubkey: PUMPSWAP_GLOBAL_VOLUME_ACCUMULATOR,
      isSigner: false,
      isWritable: false
    });
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push({
      pubkey: userVolumeAccumulator,
      isSigner: false,
      isWritable: true
    });
  }
  accounts.push(
    { pubkey: PUMPSWAP_FEE_CONFIG, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_FEE_PROGRAM, isSigner: false, isWritable: false }
  );
  if (isCashbackCoin) {
    const quoteAta = getUserVolumeAccumulatorQuoteAta(
      payer,
      quoteMint,
      quoteTokenProgram
    );
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    accounts.push(
      { pubkey: quoteAta, isSigner: false, isWritable: true },
      { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true }
    );
  }
  if (protocolParams.coinCreator === void 0 || !protocolParams.coinCreator.equals(PublicKey4.default)) {
    const poolV2 = getPoolV2PDA(baseMint);
    accounts.push({ pubkey: poolV2, isSigner: false, isWritable: false });
  }
  const protocolExtraFee = protocolParams.buybackFeeRecipient ?? getPumpSwapProtocolExtraFeeRecipientRandom();
  accounts.push({
    pubkey: protocolExtraFee,
    isSigner: false,
    isWritable: false
  });
  accounts.push({
    pubkey: getFeeRecipientAta(protocolExtraFee, quoteMint, quoteTokenProgram),
    isSigner: false,
    isWritable: true
  });
  const data = Buffer5.alloc(24);
  if (quoteIsWsolOrUsdc) {
    PUMPSWAP_SELL_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(solAmount, 16);
  } else {
    PUMPSWAP_BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(solAmount, 8);
    data.writeBigUInt64LE(tokenAmount, 16);
  }
  instructions.push(
    new TransactionInstruction3({
      keys: accounts,
      programId: PUMPSWAP_PROGRAM,
      data
    })
  );
  if (closeOutputMintAta) {
    const closeIx = closeWsolForMint(
      payer,
      outputStableMint,
      outputStableTokenProgram
    );
    if (closeIx) {
      instructions.push(closeIx);
    }
  }
  if (closeInputMintAta) {
    const inputTokenAccount = quoteIsWsolOrUsdc ? userBaseTokenAccount : userQuoteTokenAccount;
    const closeIx = new TransactionInstruction3({
      keys: [
        { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: false }
      ],
      programId: quoteIsWsolOrUsdc ? baseTokenProgram : quoteTokenProgram,
      data: Buffer5.from([9])
    });
    instructions.push(closeIx);
  }
  return instructions;
}
function buildClaimCashbackInstruction(payer, quoteMint, quoteTokenProgram) {
  const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
  const userVolumeAccumulatorWsolAta = getUserVolumeAccumulatorWsolAta(payer);
  const userWsolAta = getAssociatedTokenAddress(
    payer,
    quoteMint,
    quoteTokenProgram
  );
  const accounts = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: quoteTokenProgram, isSigner: false, isWritable: false },
    { pubkey: userVolumeAccumulatorWsolAta, isSigner: false, isWritable: true },
    { pubkey: userWsolAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram3.programId, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false }
  ];
  return new TransactionInstruction3({
    keys: accounts,
    programId: PUMPSWAP_PROGRAM,
    data: PUMPSWAP_CLAIM_CASHBACK_DISCRIMINATOR
  });
}
var POOL_SIZE = 253;
var LEGACY_POOL_SIZE = 244;
function decodePool(data) {
  const isFullAccount = [
    LEGACY_POOL_SIZE + 8,
    POOL_SIZE + 8,
    300,
    643
  ].includes(data.length);
  if (isFullAccount) {
    if (!data.subarray(0, 8).equals(PUMPSWAP_POOL_DISCRIMINATOR)) {
      return null;
    }
    data = data.subarray(8);
  }
  if (data.length < POOL_SIZE && data.length !== LEGACY_POOL_SIZE) {
    return null;
  }
  try {
    let offset = 0;
    const poolBump = data.readUInt8(offset);
    offset += 1;
    const index = data.readUInt16LE(offset);
    offset += 2;
    const creator = new PublicKey4(data.subarray(offset, offset + 32));
    offset += 32;
    const baseMint = new PublicKey4(data.subarray(offset, offset + 32));
    offset += 32;
    const quoteMint = new PublicKey4(data.subarray(offset, offset + 32));
    offset += 32;
    const lpMint = new PublicKey4(data.subarray(offset, offset + 32));
    offset += 32;
    const poolBaseTokenAccount = new PublicKey4(
      data.subarray(offset, offset + 32)
    );
    offset += 32;
    const poolQuoteTokenAccount = new PublicKey4(
      data.subarray(offset, offset + 32)
    );
    offset += 32;
    const lpSupply = data.readBigUInt64LE(offset);
    offset += 8;
    const coinCreator = new PublicKey4(data.subarray(offset, offset + 32));
    offset += 32;
    const isMayhemMode = data.readUInt8(offset) === 1;
    offset += 1;
    const isCashbackCoin = data.readUInt8(offset) === 1;
    offset += 1;
    const virtualQuoteReserves = data.length >= POOL_SIZE ? readI128LE(data, offset) : BigInt(0);
    return {
      poolBump,
      index,
      creator,
      baseMint,
      quoteMint,
      lpMint,
      poolBaseTokenAccount,
      poolQuoteTokenAccount,
      lpSupply,
      coinCreator,
      isMayhemMode,
      isCashbackCoin,
      virtualQuoteReserves
    };
  } catch {
    return null;
  }
}
async function findPoolByMint(connection, mint) {
  const poolV2 = getPoolV2PDA(mint);
  const poolV2Account = await connection.getAccountInfo(poolV2);
  if (poolV2Account?.value?.data) {
    const pool = decodePool(poolV2Account.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: poolV2, pool };
    }
  }
  const canonicalAddress = getCanonicalPoolPDA(mint);
  const canonicalAccount = await connection.getAccountInfo(canonicalAddress);
  if (canonicalAccount?.value?.data) {
    const pool = decodePool(canonicalAccount.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: canonicalAddress, pool };
    }
  }
  return null;
}
function getFeeConfigPDA() {
  const [pda] = PublicKey4.findProgramAddressSync(
    [FEE_CONFIG_SEED, PUMPSWAP_PROGRAM.toBuffer()],
    new PublicKey4("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ")
  );
  return pda;
}
function readU128LE(data, offset) {
  const lo = data.readBigUInt64LE(offset);
  const hi = data.readBigUInt64LE(offset + 8);
  return lo + (hi << BigInt(64));
}
function readI128LE(data, offset) {
  const unsigned = readU128LE(data, offset);
  const signBit = BigInt(1) << BigInt(127);
  return unsigned >= signBit ? unsigned - (BigInt(1) << BigInt(128)) : unsigned;
}
function decodeFees(data, offset) {
  return pumpSwapFeeBasisPoints(
    data.readBigUInt64LE(offset),
    data.readBigUInt64LE(offset + 8),
    data.readBigUInt64LE(offset + 16)
  );
}
function decodeFeeTiers(data, offset) {
  const len = data.readUInt32LE(offset);
  offset += 4;
  const tiers = [];
  for (let i = 0; i < len; i += 1) {
    const marketCapLamportsThreshold = readU128LE(data, offset);
    offset += 16;
    const fees = decodeFees(data, offset);
    offset += 24;
    tiers.push({ marketCapLamportsThreshold, fees });
  }
  return { tiers, offset };
}
function decodeFeeConfig(data) {
  try {
    let offset = 8;
    offset += 1;
    offset += 32;
    const flatFees = decodeFees(data, offset);
    offset += 24;
    const decodedFeeTiers = decodeFeeTiers(data, offset);
    offset = decodedFeeTiers.offset;
    const decodedStableFeeTiers = decodeFeeTiers(data, offset);
    return {
      flatFees,
      feeTiers: decodedFeeTiers.tiers,
      stableFeeTiers: decodedStableFeeTiers.tiers
    };
  } catch {
    return null;
  }
}
async function fetchFeeConfig(connection) {
  const account = await connection.getAccountInfo(PUMPSWAP_FEE_CONFIG);
  const data = account?.value?.data;
  return data ? decodeFeeConfig(Buffer5.from(data)) : null;
}
function calculateFeeTier(feeTiers, marketCapLamports) {
  const first = feeTiers[0];
  if (!first) return null;
  if (marketCapLamports < first.marketCapLamportsThreshold) {
    return first.fees;
  }
  for (let i = feeTiers.length - 1; i >= 0; i -= 1) {
    const tier = feeTiers[i];
    if (marketCapLamports >= tier.marketCapLamportsThreshold) {
      return tier.fees;
    }
  }
  return first.fees;
}
function poolMarketCapLamports(baseMintSupply, baseReserve, quoteReserve) {
  if (baseReserve === BigInt(0)) return null;
  return quoteReserve * baseMintSupply / baseReserve;
}
function isCanonicalPumpPool(baseMint, poolCreator) {
  return getPumpPoolAuthorityPDA(baseMint).equals(poolCreator);
}
function computePumpSwapFeeBasisPoints(feeConfig, poolCreator, baseMint, baseMintSupply, baseReserve, quoteReserve) {
  if (!feeConfig) {
    return legacyPumpSwapFeeBasisPoints(true);
  }
  if (!isCanonicalPumpPool(baseMint, poolCreator)) {
    return feeConfig.flatFees;
  }
  if (baseMintSupply === null) {
    return legacyPumpSwapFeeBasisPoints(true);
  }
  const marketCap = poolMarketCapLamports(
    baseMintSupply,
    baseReserve,
    quoteReserve
  );
  if (marketCap === null) {
    return legacyPumpSwapFeeBasisPoints(true);
  }
  return calculateFeeTier(feeConfig.feeTiers, marketCap) ?? feeConfig.flatFees;
}
async function fetchPool(connection, poolAddress) {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  const pool = decodePool(account.value.data);
  return pool;
}
async function getTokenBalances(connection, pool) {
  try {
    const baseBalanceResult = await connection.getTokenAccountBalance(
      pool.poolBaseTokenAccount
    );
    const quoteBalanceResult = await connection.getTokenAccountBalance(
      pool.poolQuoteTokenAccount
    );
    const baseBalance = BigInt(baseBalanceResult?.value?.amount ?? "0");
    const quoteBalance = BigInt(quoteBalanceResult?.value?.amount ?? "0");
    return { baseBalance, quoteBalance };
  } catch {
    return null;
  }
}
async function findByMint(connection, mint) {
  const poolV2 = getPoolV2PDA(mint);
  const poolV2Account = await connection.getAccountInfo(poolV2);
  if (poolV2Account?.value?.data) {
    const pool = decodePool(poolV2Account.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: poolV2, pool };
    }
  }
  const canonicalAddress = getCanonicalPoolPDA(mint);
  const canonicalAccount = await connection.getAccountInfo(canonicalAddress);
  if (canonicalAccount?.value?.data) {
    const pool = decodePool(canonicalAccount.value.data);
    if (pool && pool.baseMint.equals(mint)) {
      return { poolAddress: canonicalAddress, pool };
    }
  }
  return null;
}
async function findByBaseMint(connection, baseMint) {
  const memcmpOffset = 43;
  const filters = [
    { memcmp: { offset: memcmpOffset, bytes: baseMint.toBase58() } }
  ];
  try {
    const results = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      filters,
      encoding: "base64"
    });
    if (!results || results.length === 0) {
      return null;
    }
    const pools = [];
    for (const { pubkey, account } of results) {
      const pool = decodePool(account.data);
      if (pool) {
        pools.push({ poolAddress: pubkey, pool });
      }
    }
    if (pools.length === 0) {
      return null;
    }
    pools.sort((a, b) => Number(b.pool.lpSupply - a.pool.lpSupply));
    return pools[0] ?? null;
  } catch {
    return null;
  }
}
async function findByQuoteMint(connection, quoteMint) {
  const memcmpOffset = 75;
  const filters = [
    { memcmp: { offset: memcmpOffset, bytes: quoteMint.toBase58() } }
  ];
  try {
    const results = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      filters,
      encoding: "base64"
    });
    if (!results || results.length === 0) {
      return null;
    }
    const pools = [];
    for (const { pubkey, account } of results) {
      const pool = decodePool(account.data);
      if (pool) {
        pools.push({ poolAddress: pubkey, pool });
      }
    }
    if (pools.length === 0) {
      return null;
    }
    pools.sort((a, b) => Number(b.pool.lpSupply - a.pool.lpSupply));
    return pools[0] ?? null;
  } catch {
    return null;
  }
}

// src/instruction/bonk_builder.ts
var bonk_builder_exports = {};
__export(bonk_builder_exports, {
  BONK_AUTHORITY: () => BONK_AUTHORITY,
  BONK_BUY_EXACT_IN_DISCRIMINATOR: () => BONK_BUY_EXACT_IN_DISCRIMINATOR,
  BONK_EVENT_AUTHORITY: () => BONK_EVENT_AUTHORITY,
  BONK_GLOBAL_CONFIG: () => BONK_GLOBAL_CONFIG,
  BONK_PLATFORM_FEE_RATE: () => BONK_PLATFORM_FEE_RATE,
  BONK_POOL_SEED: () => BONK_POOL_SEED,
  BONK_POOL_STATE_SIZE: () => BONK_POOL_STATE_SIZE,
  BONK_POOL_VAULT_SEED: () => BONK_POOL_VAULT_SEED,
  BONK_PROGRAM_ID: () => BONK_PROGRAM_ID,
  BONK_PROTOCOL_FEE_RATE: () => BONK_PROTOCOL_FEE_RATE,
  BONK_SELL_EXACT_IN_DISCRIMINATOR: () => BONK_SELL_EXACT_IN_DISCRIMINATOR,
  BONK_SHARE_FEE_RATE: () => BONK_SHARE_FEE_RATE,
  BONK_USD1_GLOBAL_CONFIG: () => BONK_USD1_GLOBAL_CONFIG,
  USD1_MINT: () => USD1_MINT,
  USDC_MINT: () => USDC_MINT2,
  WSOL_MINT: () => WSOL_MINT2,
  buildBonkBuyInstructions: () => buildBonkBuyInstructions,
  buildBonkSellInstructions: () => buildBonkSellInstructions,
  decodeBonkPoolState: () => decodeBonkPoolState,
  fetchBonkPoolState: () => fetchBonkPoolState,
  getBonkCreatorAssociatedAccount: () => getBonkCreatorAssociatedAccount,
  getBonkPlatformAssociatedAccount: () => getBonkPlatformAssociatedAccount,
  getBonkPoolPDA: () => getBonkPoolPDA,
  getBonkPoolPda: () => getBonkPoolPda,
  getBonkVaultPDA: () => getBonkVaultPDA,
  getBonkVaultPda: () => getBonkVaultPda
});
import { Buffer as Buffer6 } from "buffer";
import {
  PublicKey as PublicKey5,
  Keypair as Keypair2,
  TransactionInstruction as TransactionInstruction4,
  SystemProgram as SystemProgram4
} from "@solana/web3.js";
var BONK_PROGRAM_ID = new PublicKey5(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
);
var BONK_AUTHORITY = new PublicKey5(
  "WLhv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh"
);
var BONK_GLOBAL_CONFIG = new PublicKey5(
  "6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX"
);
var BONK_USD1_GLOBAL_CONFIG = new PublicKey5(
  "EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz"
);
var BONK_EVENT_AUTHORITY = new PublicKey5(
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr"
);
var WSOL_MINT2 = new PublicKey5(
  "So11111111111111111111111111111111111111112"
);
var USD1_MINT = new PublicKey5(
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"
);
var USDC_MINT2 = new PublicKey5(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
var BONK_PLATFORM_FEE_RATE = BigInt(100);
var BONK_PROTOCOL_FEE_RATE = BigInt(25);
var BONK_SHARE_FEE_RATE = BigInt(0);
var BONK_BUY_EXACT_IN_DISCRIMINATOR = Buffer6.from([
  250,
  234,
  13,
  123,
  213,
  156,
  19,
  236
]);
var BONK_SELL_EXACT_IN_DISCRIMINATOR = Buffer6.from([
  149,
  39,
  222,
  155,
  211,
  124,
  152,
  26
]);
var BONK_POOL_SEED = Buffer6.from("pool");
var BONK_POOL_VAULT_SEED = Buffer6.from("pool_vault");
function getBonkPoolPda(baseMint, quoteMint) {
  const [pda] = PublicKey5.findProgramAddressSync(
    [BONK_POOL_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
function getBonkVaultPda(poolState, mint) {
  const [pda] = PublicKey5.findProgramAddressSync(
    [BONK_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
function getBonkPlatformAssociatedAccount(platformConfig) {
  const [pda] = PublicKey5.findProgramAddressSync(
    [platformConfig.toBuffer(), WSOL_MINT2.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
function getBonkCreatorAssociatedAccount(creator) {
  const [pda] = PublicKey5.findProgramAddressSync(
    [creator.toBuffer(), WSOL_MINT2.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
function getAmountOut(amountIn, protocolFeeRate, platformFeeRate, shareFeeRate, virtualBase, virtualQuote, realBase, realQuote, slippageBps) {
  const protocolFee = amountIn * protocolFeeRate / BigInt(1e4);
  const platformFee = amountIn * platformFeeRate / BigInt(1e4);
  const shareFee = amountIn * shareFeeRate / BigInt(1e4);
  const amountInNet = amountIn - protocolFee - platformFee - shareFee;
  const inputReserve = virtualQuote + realQuote;
  const outputReserve = virtualBase - realBase;
  const numerator = amountInNet * outputReserve;
  const denominator = inputReserve + amountInNet;
  let amountOut = numerator / denominator;
  amountOut = amountOut - amountOut * slippageBps / BigInt(1e4);
  return amountOut;
}
function buildBonkBuyInstructions(params) {
  const {
    payer,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair2 ? payer.publicKey : payer;
  const instructions = [];
  const isUsd1Pool = protocolParams.globalConfig?.equals(BONK_USD1_GLOBAL_CONFIG) ?? false;
  const quoteMint = isUsd1Pool ? USD1_MINT : WSOL_MINT2;
  const poolState = protocolParams.poolState.equals(PublicKey5.default) ? getBonkPoolPda(outputMint, quoteMint) : protocolParams.poolState;
  const globalConfig = isUsd1Pool ? BONK_USD1_GLOBAL_CONFIG : BONK_GLOBAL_CONFIG;
  const minimumAmountOut = fixedOutputAmount ?? getAmountOut(
    inputAmount,
    BONK_PROTOCOL_FEE_RATE,
    BONK_PLATFORM_FEE_RATE,
    BONK_SHARE_FEE_RATE,
    protocolParams.virtualBase,
    protocolParams.virtualQuote,
    protocolParams.realBase,
    protocolParams.realQuote,
    slippageBasisPoints
  );
  const userBaseTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    protocolParams.mintTokenProgram
  );
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const baseVault = protocolParams.baseVault.equals(PublicKey5.default) ? getBonkVaultPda(poolState, outputMint) : protocolParams.baseVault;
  const quoteVault = protocolParams.quoteVault.equals(PublicKey5.default) ? getBonkVaultPda(poolState, quoteMint) : protocolParams.quoteVault;
  if (createInputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true,
      TOKEN_PROGRAM_ID
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT
      )
    );
    const transferIx = SystemProgram4.transfer({
      fromPubkey: payerPubkey,
      toPubkey: wsolAta,
      lamports: Number(inputAmount)
    });
    instructions.push(transferIx);
    instructions.push(createSyncNativeInstruction(wsolAta));
  }
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userBaseTokenAccount,
        payerPubkey,
        outputMint,
        protocolParams.mintTokenProgram
      )
    );
  }
  const shareFeeRate = BigInt(0);
  const data = Buffer6.alloc(32);
  BONK_BUY_EXACT_IN_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(shareFeeRate, 24);
  const keys = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: BONK_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformConfig,
      isSigner: false,
      isWritable: false
    },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.mintTokenProgram,
      isSigner: false,
      isWritable: false
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: BONK_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: BONK_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram4.programId, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformAssociatedAccount,
      isSigner: false,
      isWritable: true
    },
    {
      pubkey: protocolParams.creatorAssociatedAccount,
      isSigner: false,
      isWritable: true
    }
  ];
  instructions.push(
    new TransactionInstruction4({
      keys,
      programId: BONK_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true,
      TOKEN_PROGRAM_ID
    );
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey)
    );
  }
  return instructions;
}
function buildBonkSellInstructions(params) {
  const {
    payer,
    inputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair2 ? payer.publicKey : payer;
  const instructions = [];
  const isUsd1Pool = protocolParams.globalConfig?.equals(BONK_USD1_GLOBAL_CONFIG) ?? false;
  const quoteMint = isUsd1Pool ? USD1_MINT : WSOL_MINT2;
  const poolState = protocolParams.poolState.equals(PublicKey5.default) ? getBonkPoolPda(inputMint, quoteMint) : protocolParams.poolState;
  const globalConfig = isUsd1Pool ? BONK_USD1_GLOBAL_CONFIG : BONK_GLOBAL_CONFIG;
  const minimumAmountOut = fixedOutputAmount ?? getAmountOut(
    inputAmount,
    BONK_PROTOCOL_FEE_RATE,
    BONK_PLATFORM_FEE_RATE,
    BONK_SHARE_FEE_RATE,
    protocolParams.virtualBase,
    protocolParams.virtualQuote,
    protocolParams.realBase,
    protocolParams.realQuote,
    slippageBasisPoints
  );
  const userBaseTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    protocolParams.mintTokenProgram
  );
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(
    quoteMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const baseVault = protocolParams.baseVault.equals(PublicKey5.default) ? getBonkVaultPda(poolState, inputMint) : protocolParams.baseVault;
  const quoteVault = protocolParams.quoteVault.equals(PublicKey5.default) ? getBonkVaultPda(poolState, quoteMint) : protocolParams.quoteVault;
  if (createOutputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true,
      TOKEN_PROGRAM_ID
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT
      )
    );
  }
  const shareFeeRate = BigInt(0);
  const data = Buffer6.alloc(32);
  BONK_SELL_EXACT_IN_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(shareFeeRate, 24);
  const keys = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: BONK_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformConfig,
      isSigner: false,
      isWritable: false
    },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.mintTokenProgram,
      isSigner: false,
      isWritable: false
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: BONK_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: BONK_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram4.programId, isSigner: false, isWritable: false },
    {
      pubkey: protocolParams.platformAssociatedAccount,
      isSigner: false,
      isWritable: true
    },
    {
      pubkey: protocolParams.creatorAssociatedAccount,
      isSigner: false,
      isWritable: true
    }
  ];
  instructions.push(
    new TransactionInstruction4({
      keys,
      programId: BONK_PROGRAM_ID,
      data
    })
  );
  if (closeOutputMintAta && !isUsd1Pool) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true,
      TOKEN_PROGRAM_ID
    );
    instructions.push(
      createCloseAccountInstruction(wsolAta, payerPubkey, payerPubkey)
    );
  }
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        userBaseTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        protocolParams.mintTokenProgram
      )
    );
  }
  return instructions;
}
var BONK_POOL_STATE_SIZE = 421;
function decodeBonkPoolState(data) {
  if (data.length < BONK_POOL_STATE_SIZE) {
    return null;
  }
  try {
    let offset = 0;
    const epoch = data.readBigUInt64LE(offset);
    offset += 8;
    const authBump = data.readUInt8(offset);
    offset += 1;
    const status = data.readUInt8(offset);
    offset += 1;
    const baseDecimals = data.readUInt8(offset);
    offset += 1;
    const quoteDecimals = data.readUInt8(offset);
    offset += 1;
    const migrateType = data.readUInt8(offset);
    offset += 1;
    const supply = data.readBigUInt64LE(offset);
    offset += 8;
    const totalBaseSell = data.readBigUInt64LE(offset);
    offset += 8;
    const virtualBase = data.readBigUInt64LE(offset);
    offset += 8;
    const virtualQuote = data.readBigUInt64LE(offset);
    offset += 8;
    const realBase = data.readBigUInt64LE(offset);
    offset += 8;
    const realQuote = data.readBigUInt64LE(offset);
    offset += 8;
    const totalQuoteFundRaising = data.readBigUInt64LE(offset);
    offset += 8;
    const quoteProtocolFee = data.readBigUInt64LE(offset);
    offset += 8;
    const platformFee = data.readBigUInt64LE(offset);
    offset += 8;
    const migrateFee = data.readBigUInt64LE(offset);
    offset += 8;
    const vestingSchedule = {
      totalLockedAmount: data.readBigUInt64LE(offset),
      cliffPeriod: data.readBigUInt64LE(offset + 8),
      unlockPeriod: data.readBigUInt64LE(offset + 16),
      startTime: data.readBigUInt64LE(offset + 24),
      allocatedShareAmount: data.readBigUInt64LE(offset + 32)
    };
    offset += 40;
    const globalConfig = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const platformConfig = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const baseMint = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const quoteMint = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const baseVault = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const quoteVault = new PublicKey5(data.subarray(offset, offset + 32));
    offset += 32;
    const creator = new PublicKey5(data.subarray(offset, offset + 32));
    return {
      epoch,
      authBump,
      status,
      baseDecimals,
      quoteDecimals,
      migrateType,
      supply,
      totalBaseSell,
      virtualBase,
      virtualQuote,
      realBase,
      realQuote,
      totalQuoteFundRaising,
      quoteProtocolFee,
      platformFee,
      migrateFee,
      vestingSchedule,
      globalConfig,
      platformConfig,
      baseMint,
      quoteMint,
      baseVault,
      quoteVault,
      creator
    };
  } catch {
    return null;
  }
}
async function fetchBonkPoolState(connection, poolAddress) {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  return decodeBonkPoolState(account.value.data);
}
function getBonkPoolPDA(baseMint, quoteMint) {
  const POOL_SEED2 = Buffer6.from("pool");
  const [pda] = PublicKey5.findProgramAddressSync(
    [POOL_SEED2, baseMint.toBuffer(), quoteMint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}
function getBonkVaultPDA(poolState, mint) {
  const POOL_VAULT_SEED = Buffer6.from("pool_vault");
  const [pda] = PublicKey5.findProgramAddressSync(
    [POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    BONK_PROGRAM_ID
  );
  return pda;
}

// src/instruction/raydium_cpmm_builder.ts
var raydium_cpmm_builder_exports = {};
__export(raydium_cpmm_builder_exports, {
  RAYDIUM_CPMM_AUTHORITY: () => RAYDIUM_CPMM_AUTHORITY,
  RAYDIUM_CPMM_CREATOR_FEE_RATE: () => RAYDIUM_CPMM_CREATOR_FEE_RATE2,
  RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE: () => RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE,
  RAYDIUM_CPMM_FUND_FEE_RATE: () => RAYDIUM_CPMM_FUND_FEE_RATE2,
  RAYDIUM_CPMM_OBSERVATION_STATE_SEED: () => RAYDIUM_CPMM_OBSERVATION_STATE_SEED,
  RAYDIUM_CPMM_POOL_SEED: () => RAYDIUM_CPMM_POOL_SEED,
  RAYDIUM_CPMM_POOL_STATE_SIZE: () => RAYDIUM_CPMM_POOL_STATE_SIZE,
  RAYDIUM_CPMM_POOL_VAULT_SEED: () => RAYDIUM_CPMM_POOL_VAULT_SEED,
  RAYDIUM_CPMM_PROGRAM_ID: () => RAYDIUM_CPMM_PROGRAM_ID,
  RAYDIUM_CPMM_PROTOCOL_FEE_RATE: () => RAYDIUM_CPMM_PROTOCOL_FEE_RATE2,
  RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR: () => RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR,
  RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR: () => RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR,
  RAYDIUM_CPMM_TRADE_FEE_RATE: () => RAYDIUM_CPMM_TRADE_FEE_RATE2,
  buildRaydiumCpmmBuyInstructions: () => buildRaydiumCpmmBuyInstructions,
  buildRaydiumCpmmSellInstructions: () => buildRaydiumCpmmSellInstructions,
  computeRaydiumCpmmSwapAmount: () => computeRaydiumCpmmSwapAmount2,
  decodeRaydiumCPMMpoolState: () => decodeRaydiumCPMMpoolState,
  fetchRaydiumCPMMpoolState: () => fetchRaydiumCPMMpoolState,
  getRaydiumCPMMobservationStatePDA: () => getRaydiumCPMMobservationStatePDA,
  getRaydiumCPMMpoolPDA: () => getRaydiumCPMMpoolPDA,
  getRaydiumCPMMpoolTokenBalances: () => getRaydiumCPMMpoolTokenBalances,
  getRaydiumCPMMvaultPDA: () => getRaydiumCPMMvaultPDA,
  getRaydiumCpmmObservationStatePda: () => getRaydiumCpmmObservationStatePda,
  getRaydiumCpmmPoolPda: () => getRaydiumCpmmPoolPda,
  getRaydiumCpmmVaultPda: () => getRaydiumCpmmVaultPda
});
import { Buffer as Buffer7 } from "buffer";
import {
  PublicKey as PublicKey6,
  Keypair as Keypair3,
  TransactionInstruction as TransactionInstruction5,
  SystemProgram as SystemProgram5
} from "@solana/web3.js";
var RAYDIUM_CPMM_PROGRAM_ID = new PublicKey6(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);
var RAYDIUM_CPMM_AUTHORITY = new PublicKey6(
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL"
);
var RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE = BigInt(1e6);
var RAYDIUM_CPMM_TRADE_FEE_RATE2 = BigInt(2500);
var RAYDIUM_CPMM_CREATOR_FEE_RATE2 = BigInt(0);
var RAYDIUM_CPMM_PROTOCOL_FEE_RATE2 = BigInt(12e4);
var RAYDIUM_CPMM_FUND_FEE_RATE2 = BigInt(4e4);
var RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR = Buffer7.from([
  143,
  190,
  90,
  218,
  196,
  30,
  51,
  222
]);
var RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR = Buffer7.from([
  55,
  217,
  98,
  86,
  163,
  74,
  180,
  173
]);
var RAYDIUM_CPMM_POOL_SEED = Buffer7.from("pool");
var RAYDIUM_CPMM_POOL_VAULT_SEED = Buffer7.from("pool_vault");
var RAYDIUM_CPMM_OBSERVATION_STATE_SEED = Buffer7.from("observation");
function getRaydiumCpmmPoolPda(ammConfig, mint1, mint2) {
  const [pda] = PublicKey6.findProgramAddressSync(
    [
      RAYDIUM_CPMM_POOL_SEED,
      ammConfig.toBuffer(),
      mint1.toBuffer(),
      mint2.toBuffer()
    ],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
function getRaydiumCpmmVaultPda(poolState, mint) {
  const [pda] = PublicKey6.findProgramAddressSync(
    [RAYDIUM_CPMM_POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
function getRaydiumCpmmObservationStatePda(poolState) {
  const [pda] = PublicKey6.findProgramAddressSync(
    [RAYDIUM_CPMM_OBSERVATION_STATE_SEED, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
function computeRaydiumCpmmSwapAmount2(baseReserve, quoteReserve, isBaseIn, amountIn, slippageBasisPoints) {
  const feeRate = RAYDIUM_CPMM_TRADE_FEE_RATE2;
  const feeDenominator = RAYDIUM_CPMM_FEE_RATE_DENOMINATOR_VALUE;
  const amountInAfterFee = amountIn - amountIn * feeRate / feeDenominator;
  let amountOut;
  if (isBaseIn) {
    const denominator = baseReserve + amountInAfterFee;
    amountOut = quoteReserve * amountInAfterFee / denominator;
  } else {
    const denominator = quoteReserve + amountInAfterFee;
    amountOut = baseReserve * amountInAfterFee / denominator;
  }
  const minAmountOut = amountOut - amountOut * slippageBasisPoints / BigInt(1e4);
  return { amountOut, minAmountOut };
}
function buildRaydiumCpmmBuyInstructions(params) {
  const {
    payer,
    outputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair3 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey6(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey6(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    ammConfig,
    baseMint,
    quoteMint,
    baseTokenProgram,
    quoteTokenProgram,
    baseVault,
    quoteVault,
    baseReserve,
    quoteReserve,
    observationState
  } = protocolParams;
  const isWsol = baseMint.equals(WSOL_TOKEN_ACCOUNT2) || quoteMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = baseMint.equals(USDC_TOKEN_ACCOUNT2) || quoteMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isBaseIn = baseMint.equals(WSOL_TOKEN_ACCOUNT2) || baseMint.equals(USDC_TOKEN_ACCOUNT2);
  const inputMint = isBaseIn ? baseMint : quoteMint;
  const inputTokenProgram = isBaseIn ? baseTokenProgram : quoteTokenProgram;
  const expectedOutputMint = isBaseIn ? quoteMint : baseMint;
  const outputTokenProgram = isBaseIn ? quoteTokenProgram : baseTokenProgram;
  if (!outputMint.equals(expectedOutputMint)) {
    throw new Error(
      `outputMint must match Raydium CPMM pool side ${expectedOutputMint.toBase58()}`
    );
  }
  const poolState = protocolParams.poolState && !protocolParams.poolState.equals(PublicKey6.default) ? protocolParams.poolState : getRaydiumCpmmPoolPda(ammConfig, baseMint, quoteMint);
  const minimumAmountOut = fixedOutputAmount ?? computeRaydiumCpmmSwapAmount2(
    baseReserve,
    quoteReserve,
    isBaseIn,
    inputAmount,
    slippageBasisPoints
  ).minAmountOut;
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    outputTokenProgram
  );
  const inputVaultAccount = (() => {
    if (baseMint.equals(inputMint) && baseVault && !baseVault.equals(PublicKey6.default)) {
      return baseVault;
    }
    if (quoteMint.equals(inputMint) && quoteVault && !quoteVault.equals(PublicKey6.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, inputMint);
  })();
  const outputVaultAccount = (() => {
    if (baseMint.equals(outputMint) && baseVault && !baseVault.equals(PublicKey6.default)) {
      return baseVault;
    }
    if (quoteMint.equals(outputMint) && quoteVault && !quoteVault.equals(PublicKey6.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, outputMint);
  })();
  const observationStateAccount = observationState && !observationState.equals(PublicKey6.default) ? observationState : getRaydiumCpmmObservationStatePda(poolState);
  if (createInputMintAta) {
    const isInputWsol = inputMint.equals(WSOL_TOKEN_ACCOUNT2);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        inputTokenAccount,
        payerPubkey,
        inputMint,
        inputTokenProgram
      )
    );
    if (isInputWsol) {
      instructions.push(
        SystemProgram5.transfer({
          fromPubkey: payerPubkey,
          toPubkey: inputTokenAccount,
          lamports: inputAmount
        })
      );
      instructions.push(createSyncNativeInstruction(inputTokenAccount));
    }
  }
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }
  const data = Buffer7.alloc(24);
  (fixedOutputAmount !== void 0 ? RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR : RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount ?? minimumAmountOut, 16);
  const accounts = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: RAYDIUM_CPMM_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: inputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: outputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationStateAccount, isSigner: false, isWritable: true }
  ];
  instructions.push(
    new TransactionInstruction5({
      keys: accounts,
      programId: RAYDIUM_CPMM_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    instructions.push(
      createCloseAccountInstruction(
        inputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        inputTokenProgram
      )
    );
  }
  return instructions;
}
function buildRaydiumCpmmSellInstructions(params) {
  const {
    payer,
    inputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair3 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey6(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey6(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    ammConfig,
    baseMint,
    quoteMint,
    baseTokenProgram,
    quoteTokenProgram,
    baseVault,
    quoteVault,
    baseReserve,
    quoteReserve,
    observationState
  } = protocolParams;
  const isWsol = baseMint.equals(WSOL_TOKEN_ACCOUNT2) || quoteMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = baseMint.equals(USDC_TOKEN_ACCOUNT2) || quoteMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isQuoteOut = quoteMint.equals(WSOL_TOKEN_ACCOUNT2) || quoteMint.equals(USDC_TOKEN_ACCOUNT2);
  const expectedInputMint = isQuoteOut ? baseMint : quoteMint;
  const inputTokenProgram = isQuoteOut ? baseTokenProgram : quoteTokenProgram;
  const outputMint = isQuoteOut ? quoteMint : baseMint;
  const outputTokenProgram = isQuoteOut ? quoteTokenProgram : baseTokenProgram;
  if (!inputMint.equals(expectedInputMint)) {
    throw new Error(
      `inputMint must match Raydium CPMM pool side ${expectedInputMint.toBase58()}`
    );
  }
  const poolState = protocolParams.poolState && !protocolParams.poolState.equals(PublicKey6.default) ? protocolParams.poolState : getRaydiumCpmmPoolPda(ammConfig, baseMint, quoteMint);
  const minimumAmountOut = fixedOutputAmount ?? computeRaydiumCpmmSwapAmount2(
    baseReserve,
    quoteReserve,
    isQuoteOut,
    inputAmount,
    slippageBasisPoints
  ).minAmountOut;
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    outputTokenProgram
  );
  const inputVaultAccount = (() => {
    if (baseMint.equals(inputMint) && baseVault && !baseVault.equals(PublicKey6.default)) {
      return baseVault;
    }
    if (quoteMint.equals(inputMint) && quoteVault && !quoteVault.equals(PublicKey6.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, inputMint);
  })();
  const outputVaultAccount = (() => {
    if (baseMint.equals(outputMint) && baseVault && !baseVault.equals(PublicKey6.default)) {
      return baseVault;
    }
    if (quoteMint.equals(outputMint) && quoteVault && !quoteVault.equals(PublicKey6.default)) {
      return quoteVault;
    }
    return getRaydiumCpmmVaultPda(poolState, outputMint);
  })();
  const observationStateAccount = observationState && !observationState.equals(PublicKey6.default) ? observationState : getRaydiumCpmmObservationStatePda(poolState);
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }
  const data = Buffer7.alloc(24);
  (fixedOutputAmount !== void 0 ? RAYDIUM_CPMM_SWAP_BASE_OUT_DISCRIMINATOR : RAYDIUM_CPMM_SWAP_BASE_IN_DISCRIMINATOR).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount ?? minimumAmountOut, 16);
  const accounts = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: RAYDIUM_CPMM_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: inputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: outputVaultAccount, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationStateAccount, isSigner: false, isWritable: true }
  ];
  instructions.push(
    new TransactionInstruction5({
      keys: accounts,
      programId: RAYDIUM_CPMM_PROGRAM_ID,
      data
    })
  );
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    instructions.push(
      createCloseAccountInstruction(
        outputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        outputTokenProgram
      )
    );
  }
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        inputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        inputTokenProgram
      )
    );
  }
  return instructions;
}
var RAYDIUM_CPMM_POOL_STATE_SIZE = 629;
function decodeRaydiumCPMMpoolState(data) {
  if (data.length < RAYDIUM_CPMM_POOL_STATE_SIZE) {
    return null;
  }
  try {
    let offset = 0;
    const ammConfig = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const poolCreator = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token0Vault = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token1Vault = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const lpMint = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token0Mint = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token1Mint = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token0Program = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const token1Program = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const observationKey = new PublicKey6(data.subarray(offset, offset + 32));
    offset += 32;
    const authBump = data.readUInt8(offset);
    offset += 1;
    const status = data.readUInt8(offset);
    offset += 1;
    const lpMintDecimals = data.readUInt8(offset);
    offset += 1;
    const mint0Decimals = data.readUInt8(offset);
    offset += 1;
    const mint1Decimals = data.readUInt8(offset);
    offset += 1;
    const lpSupply = data.readBigUInt64LE(offset);
    offset += 8;
    const protocolFeesToken0 = data.readBigUInt64LE(offset);
    offset += 8;
    const protocolFeesToken1 = data.readBigUInt64LE(offset);
    offset += 8;
    const fundFeesToken0 = data.readBigUInt64LE(offset);
    offset += 8;
    const fundFeesToken1 = data.readBigUInt64LE(offset);
    offset += 8;
    const openTime = data.readBigUInt64LE(offset);
    offset += 8;
    const recentEpoch = data.readBigUInt64LE(offset);
    return {
      ammConfig,
      poolCreator,
      token0Vault,
      token1Vault,
      lpMint,
      token0Mint,
      token1Mint,
      token0Program,
      token1Program,
      observationKey,
      authBump,
      status,
      lpMintDecimals,
      mint0Decimals,
      mint1Decimals,
      lpSupply,
      protocolFeesToken0,
      protocolFeesToken1,
      fundFeesToken0,
      fundFeesToken1,
      openTime,
      recentEpoch
    };
  } catch {
    return null;
  }
}
async function fetchRaydiumCPMMpoolState(connection, poolAddress) {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  return decodeRaydiumCPMMpoolState(account.value.data);
}
function getRaydiumCPMMpoolPDA(ammConfig, mint1, mint2) {
  const POOL_SEED2 = Buffer7.from("pool");
  const [pda] = PublicKey6.findProgramAddressSync(
    [POOL_SEED2, ammConfig.toBuffer(), mint1.toBuffer(), mint2.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
function getRaydiumCPMMvaultPDA(poolState, mint) {
  const POOL_VAULT_SEED = Buffer7.from("pool_vault");
  const [pda] = PublicKey6.findProgramAddressSync(
    [POOL_VAULT_SEED, poolState.toBuffer(), mint.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
function getRaydiumCPMMobservationStatePDA(poolState) {
  const OBSERVATION_STATE_SEED = Buffer7.from("observation");
  const [pda] = PublicKey6.findProgramAddressSync(
    [OBSERVATION_STATE_SEED, poolState.toBuffer()],
    RAYDIUM_CPMM_PROGRAM_ID
  );
  return pda;
}
async function getRaydiumCPMMpoolTokenBalances(connection, poolState, token0Mint, token1Mint) {
  try {
    const token0Vault = getRaydiumCPMMvaultPDA(poolState, token0Mint);
    const token1Vault = getRaydiumCPMMvaultPDA(poolState, token1Mint);
    const token0Result = await connection.getTokenAccountBalance(token0Vault);
    const token1Result = await connection.getTokenAccountBalance(token1Vault);
    const token0Balance = BigInt(token0Result?.value?.amount ?? "0");
    const token1Balance = BigInt(token1Result?.value?.amount ?? "0");
    return { token0Balance, token1Balance };
  } catch {
    return null;
  }
}

// src/instruction/raydium_amm_v4_builder.ts
var raydium_amm_v4_builder_exports = {};
__export(raydium_amm_v4_builder_exports, {
  AMM_INFO_SIZE: () => AMM_INFO_SIZE,
  MARKET_STATE_SIZE: () => MARKET_STATE_SIZE,
  RAYDIUM_AMM_V4_AUTHORITY: () => RAYDIUM_AMM_V4_AUTHORITY,
  RAYDIUM_AMM_V4_POOL_SEED: () => RAYDIUM_AMM_V4_POOL_SEED,
  RAYDIUM_AMM_V4_PROGRAM_ID: () => RAYDIUM_AMM_V4_PROGRAM_ID,
  RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR: () => RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR,
  RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR: () => RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR,
  RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR: () => RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR2,
  RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR: () => RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR2,
  RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR: () => RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR2,
  RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR: () => RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR2,
  buildRaydiumAmmV4BuyInstructions: () => buildRaydiumAmmV4BuyInstructions,
  buildRaydiumAmmV4SellInstructions: () => buildRaydiumAmmV4SellInstructions,
  computeRaydiumAmmV4SwapAmount: () => computeRaydiumAmmV4SwapAmount2,
  decodeAmmInfo: () => decodeAmmInfo,
  decodeMarketState: () => decodeMarketState,
  deriveSerumVaultSigner: () => deriveSerumVaultSigner,
  fetchAmmInfo: () => fetchAmmInfo,
  fetchMarketState: () => fetchMarketState
});
import { Buffer as Buffer8 } from "buffer";
import {
  PublicKey as PublicKey7,
  Keypair as Keypair4,
  TransactionInstruction as TransactionInstruction6,
  SystemProgram as SystemProgram6
} from "@solana/web3.js";
var SOL_TOKEN_ACCOUNT3 = new PublicKey7(
  "So11111111111111111111111111111111111111111"
);
var RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey7(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
var RAYDIUM_AMM_V4_AUTHORITY = new PublicKey7(
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
);
var RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR2 = BigInt(25);
var RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR2 = BigInt(1e4);
var RAYDIUM_AMM_V4_SWAP_FEE_NUMERATOR2 = BigInt(25);
var RAYDIUM_AMM_V4_SWAP_FEE_DENOMINATOR2 = BigInt(1e4);
var RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR = Buffer8.from([
  9
]);
var RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR = Buffer8.from([
  11
]);
var RAYDIUM_AMM_V4_POOL_SEED = Buffer8.from("pool");
function computeRaydiumAmmV4SwapAmount2(coinReserve, pcReserve, isCoinIn, amountIn, slippageBasisPoints) {
  const amountInAfterFee = amountIn - amountIn * RAYDIUM_AMM_V4_TRADE_FEE_NUMERATOR2 / RAYDIUM_AMM_V4_TRADE_FEE_DENOMINATOR2;
  let amountOut;
  if (isCoinIn) {
    const denominator = coinReserve + amountInAfterFee;
    amountOut = pcReserve * amountInAfterFee / denominator;
  } else {
    const denominator = pcReserve + amountInAfterFee;
    amountOut = coinReserve * amountInAfterFee / denominator;
  }
  const minAmountOut = amountOut - amountOut * slippageBasisPoints / BigInt(1e4);
  return { amountOut, minAmountOut };
}
function isDefaultPublicKey(pubkey) {
  return pubkey.equals(PublicKey7.default);
}
function isMintMatch(requested, expected) {
  return requested.equals(expected) || expected.equals(NATIVE_MINT) && requested.equals(SOL_TOKEN_ACCOUNT3);
}
function ensureExpectedMint(label, requested, expected) {
  if (!isDefaultPublicKey(requested) && !isMintMatch(requested, expected)) {
    throw new Error(
      `${label} must match the Raydium AMM v4 pool side (${expected.toBase58()}), got ${requested.toBase58()}`
    );
  }
}
function ensureMarketAccounts(params) {
  const required = [
    ["ammOpenOrders", params.ammOpenOrders],
    ["ammTargetOrders", params.ammTargetOrders],
    ["serumProgram", params.serumProgram],
    ["serumMarket", params.serumMarket],
    ["serumBids", params.serumBids],
    ["serumAsks", params.serumAsks],
    ["serumEventQueue", params.serumEventQueue],
    ["serumCoinVaultAccount", params.serumCoinVaultAccount],
    ["serumPcVaultAccount", params.serumPcVaultAccount],
    ["serumVaultSigner", params.serumVaultSigner]
  ];
  for (const [name, account] of required) {
    if (isDefaultPublicKey(account)) {
      throw new Error(
        `Raydium AMM v4 requires ${name}; pass real market accounts from the AMM/market state`
      );
    }
  }
}
function buildRaydiumAmmV4BuyInstructions(params) {
  const {
    payer,
    outputMint: requestedOutputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair4 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey7(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey7(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    amm,
    coinMint,
    pcMint,
    tokenCoin,
    tokenPc,
    ammOpenOrders,
    ammTargetOrders,
    serumProgram,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    coinReserve,
    pcReserve
  } = protocolParams;
  ensureMarketAccounts(protocolParams);
  const isWsol = coinMint.equals(WSOL_TOKEN_ACCOUNT2) || pcMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = coinMint.equals(USDC_TOKEN_ACCOUNT2) || pcMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isBaseIn = coinMint.equals(WSOL_TOKEN_ACCOUNT2) || coinMint.equals(USDC_TOKEN_ACCOUNT2);
  const swapResult = computeRaydiumAmmV4SwapAmount2(
    coinReserve,
    pcReserve,
    isBaseIn,
    inputAmount,
    slippageBasisPoints
  );
  const minimumAmountOut = fixedOutputAmount ?? swapResult.minAmountOut;
  const inputMint = isBaseIn ? coinMint : pcMint;
  const outputMint = isBaseIn ? pcMint : coinMint;
  ensureExpectedMint("outputMint", requestedOutputMint, outputMint);
  const userSourceTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const userDestinationTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  if (createInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
    instructions.push(
      SystemProgram6.transfer({
        fromPubkey: payerPubkey,
        toPubkey: wsolAta,
        lamports: Number(inputAmount)
      })
    );
    instructions.push(createSyncNativeInstruction(wsolAta));
  } else if (createInputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userSourceTokenAccount,
        payerPubkey,
        inputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userDestinationTokenAccount,
        payerPubkey,
        outputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }
  const data = Buffer8.alloc(17);
  (fixedOutputAmount !== void 0 ? RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR : RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 1);
  data.writeBigUInt64LE(minimumAmountOut, 9);
  const accounts = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: RAYDIUM_AMM_V4_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: tokenCoin, isSigner: false, isWritable: true },
    // Pool Coin Token Account
    { pubkey: tokenPc, isSigner: false, isWritable: true },
    // Pool Pc Token Account
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction6({
      keys: accounts,
      programId: RAYDIUM_AMM_V4_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createCloseAccountInstruction(
        wsolAta,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  return instructions;
}
function buildRaydiumAmmV4SellInstructions(params) {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    slippageBasisPoints = BigInt(1e3),
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  const payerPubkey = payer instanceof Keypair4 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey7(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey7(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    amm,
    coinMint,
    pcMint,
    tokenCoin,
    tokenPc,
    ammOpenOrders,
    ammTargetOrders,
    serumProgram,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    coinReserve,
    pcReserve
  } = protocolParams;
  ensureMarketAccounts(protocolParams);
  const isWsol = coinMint.equals(WSOL_TOKEN_ACCOUNT2) || pcMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = coinMint.equals(USDC_TOKEN_ACCOUNT2) || pcMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isBaseIn = pcMint.equals(WSOL_TOKEN_ACCOUNT2) || pcMint.equals(USDC_TOKEN_ACCOUNT2);
  const swapResult = computeRaydiumAmmV4SwapAmount2(
    coinReserve,
    pcReserve,
    isBaseIn,
    inputAmount,
    slippageBasisPoints
  );
  const minimumAmountOut = fixedOutputAmount ?? swapResult.minAmountOut;
  const outputMint = isBaseIn ? pcMint : coinMint;
  const inputMint = isBaseIn ? coinMint : pcMint;
  ensureExpectedMint("inputMint", requestedInputMint, inputMint);
  if (requestedOutputMint) {
    ensureExpectedMint("outputMint", requestedOutputMint, outputMint);
  }
  const userSourceTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  const userDestinationTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  if (createOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  } else if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        userDestinationTokenAccount,
        payerPubkey,
        outputMint,
        TOKEN_PROGRAM_ID
      )
    );
  }
  const data = Buffer8.alloc(17);
  (fixedOutputAmount !== void 0 ? RAYDIUM_AMM_V4_SWAP_BASE_OUT_DISCRIMINATOR : RAYDIUM_AMM_V4_SWAP_BASE_IN_DISCRIMINATOR).copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 1);
  data.writeBigUInt64LE(minimumAmountOut, 9);
  const accounts = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: RAYDIUM_AMM_V4_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: tokenCoin, isSigner: false, isWritable: true },
    // Pool Coin Token Account
    { pubkey: tokenPc, isSigner: false, isWritable: true },
    // Pool Pc Token Account
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction6({
      keys: accounts,
      programId: RAYDIUM_AMM_V4_PROGRAM_ID,
      data
    })
  );
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createCloseAccountInstruction(
        wsolAta,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        userSourceTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  return instructions;
}
var AMM_INFO_SIZE = 752;
var MARKET_STATE_SIZE = 388;
function decodeAmmInfo(data) {
  if (data.length < AMM_INFO_SIZE) {
    return null;
  }
  try {
    let offset = 0;
    const readU64 = () => {
      const val = data.readBigUInt64LE(offset);
      offset += 8;
      return val;
    };
    const status = readU64();
    const nonce = readU64();
    const orderNum = readU64();
    const depth = readU64();
    const coinDecimals = readU64();
    const pcDecimals = readU64();
    const state = readU64();
    const resetFlag = readU64();
    const minSize = readU64();
    const volMaxCutRatio = readU64();
    const amountWave = readU64();
    const coinLotSize = readU64();
    const pcLotSize = readU64();
    const minPriceMultiplier = readU64();
    const maxPriceMultiplier = readU64();
    const sysDecimalValue = readU64();
    const fees = {
      minSeparateNumerator: readU64(),
      minSeparateDenominator: readU64(),
      tradeFeeNumerator: readU64(),
      tradeFeeDenominator: readU64(),
      pnlNumerator: readU64(),
      pnlDenominator: readU64(),
      swapFeeNumerator: readU64(),
      swapFeeDenominator: readU64()
    };
    const output = {
      needTakePnlCoin: readU64(),
      needTakePnlPc: readU64(),
      totalPnlPc: readU64(),
      totalPnlCoin: readU64(),
      poolOpenTime: readU64(),
      punishPcAmount: readU64(),
      punishCoinAmount: readU64(),
      orderbookToInitTime: readU64(),
      swapCoinInAmount: readU64(),
      swapPcOutAmount: readU64(),
      swapTakePcFee: readU64(),
      swapPcInAmount: readU64(),
      swapCoinOutAmount: readU64(),
      swapTakeCoinFee: readU64()
    };
    const tokenCoin = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const tokenPc = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const coinMint = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const pcMint = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const lpMint = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const openOrders = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const market = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const serumDex = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const targetOrders = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const withdrawQueue = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const tokenTempLp = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const ammOwner = new PublicKey7(data.subarray(offset, offset + 32));
    offset += 32;
    const lpAmount = readU64();
    const clientOrderId = readU64();
    return {
      status,
      nonce,
      orderNum,
      depth,
      coinDecimals,
      pcDecimals,
      state,
      resetFlag,
      minSize,
      volMaxCutRatio,
      amountWave,
      coinLotSize,
      pcLotSize,
      minPriceMultiplier,
      maxPriceMultiplier,
      sysDecimalValue,
      fees,
      output,
      tokenCoin,
      tokenPc,
      coinMint,
      pcMint,
      lpMint,
      openOrders,
      market,
      serumDex,
      targetOrders,
      withdrawQueue,
      tokenTempLp,
      ammOwner,
      lpAmount,
      clientOrderId
    };
  } catch {
    return null;
  }
}
function decodeMarketState(data) {
  if (data.length < MARKET_STATE_SIZE) {
    return null;
  }
  try {
    let offset = 5;
    const readU64 = () => {
      const val = data.readBigUInt64LE(offset);
      offset += 8;
      return val;
    };
    const readPubkey = () => {
      const val = new PublicKey7(data.subarray(offset, offset + 32));
      offset += 32;
      return val;
    };
    readU64();
    readPubkey();
    const vaultSignerNonce = readU64();
    readPubkey();
    readPubkey();
    const serumCoinVaultAccount = readPubkey();
    readU64();
    readU64();
    const serumPcVaultAccount = readPubkey();
    readU64();
    readU64();
    readU64();
    readPubkey();
    const serumEventQueue = readPubkey();
    const serumBids = readPubkey();
    const serumAsks = readPubkey();
    return {
      vaultSignerNonce,
      serumCoinVaultAccount,
      serumPcVaultAccount,
      serumEventQueue,
      serumBids,
      serumAsks
    };
  } catch {
    return null;
  }
}
function deriveSerumVaultSigner(serumProgram, serumMarket, vaultSignerNonce) {
  const nonce = Buffer8.alloc(8);
  nonce.writeBigUInt64LE(vaultSignerNonce);
  try {
    return PublicKey7.createProgramAddressSync(
      [serumMarket.toBuffer(), nonce],
      serumProgram
    );
  } catch {
    return PublicKey7.createProgramAddressSync(
      [serumMarket.toBuffer(), Buffer8.from([Number(vaultSignerNonce & 0xffn)])],
      serumProgram
    );
  }
}
async function fetchAmmInfo(connection, amm) {
  const account = await connection.getAccountInfo(amm);
  if (!account?.value?.data) {
    return null;
  }
  return decodeAmmInfo(account.value.data);
}
async function fetchMarketState(connection, market) {
  const account = await connection.getAccountInfo(market);
  if (!account?.value?.data) {
    return null;
  }
  return decodeMarketState(account.value.data);
}

// src/instruction/meteora_damm_v2_builder.ts
var meteora_damm_v2_builder_exports = {};
__export(meteora_damm_v2_builder_exports, {
  METEORA_DAMM_V2_AUTHORITY: () => METEORA_DAMM_V2_AUTHORITY,
  METEORA_DAMM_V2_EVENT_AUTHORITY_SEED: () => METEORA_DAMM_V2_EVENT_AUTHORITY_SEED,
  METEORA_DAMM_V2_PROGRAM_ID: () => METEORA_DAMM_V2_PROGRAM_ID,
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR: () => METEORA_DAMM_V2_SWAP2_DISCRIMINATOR,
  METEORA_DAMM_V2_SWAP_DISCRIMINATOR: () => METEORA_DAMM_V2_SWAP_DISCRIMINATOR,
  METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL: () => METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL,
  METEORA_POOL_SIZE: () => METEORA_POOL_SIZE,
  buildMeteoraDammV2BuyInstructions: () => buildMeteoraDammV2BuyInstructions,
  buildMeteoraDammV2SellInstructions: () => buildMeteoraDammV2SellInstructions,
  decodeMeteoraPool: () => decodeMeteoraPool,
  fetchMeteoraPool: () => fetchMeteoraPool,
  getMeteoraDammV2EventAuthorityPda: () => getMeteoraDammV2EventAuthorityPda
});
import { Buffer as Buffer9 } from "buffer";
import {
  PublicKey as PublicKey8,
  Keypair as Keypair5,
  TransactionInstruction as TransactionInstruction7,
  SystemProgram as SystemProgram7
} from "@solana/web3.js";
var SOL_TOKEN_ACCOUNT4 = new PublicKey8(
  "So11111111111111111111111111111111111111111"
);
var METEORA_DAMM_V2_PROGRAM_ID = new PublicKey8(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);
var METEORA_DAMM_V2_AUTHORITY = new PublicKey8(
  "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC"
);
var METEORA_DAMM_V2_SWAP_DISCRIMINATOR = Buffer9.from([
  248,
  198,
  158,
  145,
  225,
  117,
  135,
  200
]);
var METEORA_DAMM_V2_SWAP2_DISCRIMINATOR = Buffer9.from([
  65,
  75,
  63,
  76,
  235,
  91,
  91,
  136
]);
var METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL = 1;
var METEORA_DAMM_V2_EVENT_AUTHORITY_SEED = Buffer9.from("__event_authority");
function getMeteoraDammV2EventAuthorityPda() {
  const [pda] = PublicKey8.findProgramAddressSync(
    [METEORA_DAMM_V2_EVENT_AUTHORITY_SEED],
    METEORA_DAMM_V2_PROGRAM_ID
  );
  return pda;
}
function isDefaultPublicKey2(pubkey) {
  return pubkey.equals(PublicKey8.default);
}
function isMintMatch2(requested, expected) {
  return requested.equals(expected) || expected.equals(NATIVE_MINT) && requested.equals(SOL_TOKEN_ACCOUNT4);
}
function ensureExpectedMint2(label, requested, expected) {
  if (!isDefaultPublicKey2(requested) && !isMintMatch2(requested, expected)) {
    throw new Error(
      `${label} must match the Meteora DAMM v2 pool side (${expected.toBase58()}), got ${requested.toBase58()}`
    );
  }
}
function buildMeteoraDammV2BuyInstructions(params) {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createInputMintAta = true,
    createOutputMintAta = true,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  if (!fixedOutputAmount) {
    throw new Error("fixedOutputAmount must be set for Meteora DAMM V2 swap");
  }
  const payerPubkey = payer instanceof Keypair5 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey8(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey8(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram
  } = protocolParams;
  const isWsol = tokenAMint.equals(WSOL_TOKEN_ACCOUNT2) || tokenBMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = tokenAMint.equals(USDC_TOKEN_ACCOUNT2) || tokenBMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isAIn = tokenAMint.equals(WSOL_TOKEN_ACCOUNT2) || tokenAMint.equals(USDC_TOKEN_ACCOUNT2);
  const inputMint = isAIn ? tokenAMint : tokenBMint;
  const outputMint = isAIn ? tokenBMint : tokenAMint;
  ensureExpectedMint2("inputMint", requestedInputMint, inputMint);
  ensureExpectedMint2("outputMint", requestedOutputMint, outputMint);
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();
  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;
  if (createInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
    instructions.push(
      SystemProgram7.transfer({
        fromPubkey: payerPubkey,
        toPubkey: wsolAta,
        lamports: Number(inputAmount)
      })
    );
    instructions.push(createSyncNativeInstruction(wsolAta));
  } else if (createInputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        inputTokenAccount,
        payerPubkey,
        inputMint,
        inputTokenProgram
      )
    );
  }
  if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }
  const data = Buffer9.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount, 16);
  data.writeUInt8(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL, 24);
  const accounts = [
    { pubkey: METEORA_DAMM_V2_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction7({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data
    })
  );
  if (closeInputMintAta && inputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createCloseAccountInstruction(
        wsolAta,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  return instructions;
}
function buildMeteoraDammV2SellInstructions(params) {
  const {
    payer,
    inputMint: requestedInputMint,
    outputMint: requestedOutputMint,
    inputAmount,
    fixedOutputAmount,
    createOutputMintAta = true,
    closeOutputMintAta = false,
    closeInputMintAta = false,
    protocolParams
  } = params;
  if (inputAmount === BigInt(0)) {
    throw new Error("Amount cannot be zero");
  }
  if (!fixedOutputAmount) {
    throw new Error("fixedOutputAmount must be set for Meteora DAMM V2 swap");
  }
  const payerPubkey = payer instanceof Keypair5 ? payer.publicKey : payer;
  const instructions = [];
  const WSOL_TOKEN_ACCOUNT2 = new PublicKey8(
    "So11111111111111111111111111111111111111112"
  );
  const USDC_TOKEN_ACCOUNT2 = new PublicKey8(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const {
    pool,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAProgram,
    tokenBProgram
  } = protocolParams;
  const isWsol = tokenBMint.equals(WSOL_TOKEN_ACCOUNT2) || tokenAMint.equals(WSOL_TOKEN_ACCOUNT2);
  const isUsdc = tokenBMint.equals(USDC_TOKEN_ACCOUNT2) || tokenAMint.equals(USDC_TOKEN_ACCOUNT2);
  if (!isWsol && !isUsdc) {
    throw new Error("Pool must contain WSOL or USDC");
  }
  const isAIn = tokenBMint.equals(WSOL_TOKEN_ACCOUNT2) || tokenBMint.equals(USDC_TOKEN_ACCOUNT2);
  const inputMint = isAIn ? tokenAMint : tokenBMint;
  const outputMint = isAIn ? tokenBMint : tokenAMint;
  ensureExpectedMint2("inputMint", requestedInputMint, inputMint);
  ensureExpectedMint2("outputMint", requestedOutputMint, outputMint);
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    payerPubkey,
    true,
    isAIn ? tokenAProgram : tokenBProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    payerPubkey,
    true,
    isAIn ? tokenBProgram : tokenAProgram
  );
  const eventAuthority = getMeteoraDammV2EventAuthorityPda();
  const inputTokenProgram = isAIn ? tokenAProgram : tokenBProgram;
  const outputTokenProgram = isAIn ? tokenBProgram : tokenAProgram;
  if (createOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        wsolAta,
        payerPubkey,
        NATIVE_MINT,
        TOKEN_PROGRAM_ID
      )
    );
  } else if (createOutputMintAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payerPubkey,
        outputTokenAccount,
        payerPubkey,
        outputMint,
        outputTokenProgram
      )
    );
  }
  const data = Buffer9.alloc(25);
  METEORA_DAMM_V2_SWAP2_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(inputAmount, 8);
  data.writeBigUInt64LE(fixedOutputAmount, 16);
  data.writeUInt8(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL, 24);
  const accounts = [
    { pubkey: METEORA_DAMM_V2_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: METEORA_DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false }
  ];
  instructions.push(
    new TransactionInstruction7({
      keys: accounts,
      programId: METEORA_DAMM_V2_PROGRAM_ID,
      data
    })
  );
  if (closeOutputMintAta && outputMint.equals(WSOL_TOKEN_ACCOUNT2)) {
    const wsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      payerPubkey,
      true
    );
    instructions.push(
      createCloseAccountInstruction(
        wsolAta,
        payerPubkey,
        payerPubkey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  if (closeInputMintAta) {
    instructions.push(
      createCloseAccountInstruction(
        inputTokenAccount,
        payerPubkey,
        payerPubkey,
        [],
        isAIn ? tokenAProgram : tokenBProgram
      )
    );
  }
  return instructions;
}
var METEORA_POOL_SIZE = 1104;
function decodeMeteoraPool(data) {
  if (data.length < METEORA_POOL_SIZE) {
    return null;
  }
  try {
    let offset = 248;
    const tokenAMint = new PublicKey8(data.subarray(offset, offset + 32));
    offset += 32;
    const tokenBMint = new PublicKey8(data.subarray(offset, offset + 32));
    offset += 32;
    const tokenAVault = new PublicKey8(data.subarray(offset, offset + 32));
    offset += 32;
    const tokenBVault = new PublicKey8(data.subarray(offset, offset + 32));
    offset += 32;
    offset += 64;
    const liquidity = data.readBigUInt64LE(offset) | data.readBigUInt64LE(offset + 8) << BigInt(64);
    offset += 16;
    offset += 16;
    offset += 32;
    offset += 32;
    const sqrtPrice = data.readBigUInt64LE(offset) | data.readBigUInt64LE(offset + 8) << BigInt(64);
    offset += 16;
    offset += 8;
    const poolStatus = data.readUInt8(offset + 1);
    const tokenAFlag = data.readUInt8(offset + 2);
    const tokenBFlag = data.readUInt8(offset + 3);
    return {
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      liquidity,
      sqrtPrice,
      poolStatus,
      tokenAFlag,
      tokenBFlag
    };
  } catch {
    return null;
  }
}
async function fetchMeteoraPool(connection, poolAddress) {
  const account = await connection.getAccountInfo(poolAddress);
  if (!account?.value?.data) {
    return null;
  }
  if (account.value.owner && !account.value.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) {
    return null;
  }
  return decodeMeteoraPool(account.value.data.slice(8));
}
export {
  bonk_builder_exports as bonk,
  calc_exports as calc,
  constants_exports as constants,
  meteora_damm_v2_builder_exports as meteoraDammV2,
  pumpfun_builder_exports as pumpfun,
  pumpswap_exports as pumpswap,
  raydium_amm_v4_builder_exports as raydiumAmmV4,
  raydium_cpmm_builder_exports as raydiumCpmm,
  spl_token_exports as splToken
};
