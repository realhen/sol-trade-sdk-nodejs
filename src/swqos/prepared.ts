import { Buffer } from 'buffer';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { buildTipInstruction, compileTransaction } from '../common/transaction';
import { SwqosTransport, SwqosType, TradeType } from '../enums';
import { ClientFactory } from './clients';

export interface HttpSenderRoute {
  id: string;
  name: string;
  url: string;
  tipAccount?: string;
  tipLamports: number;
  headers?: Record<string, string>;
  type?: SwqosType;
  swqosOnly?: boolean;
}

export interface PreparedTransactionVariant {
  routeId: string;
  transaction: VersionedTransaction;
}

export interface SignedTransactionVariant {
  routeId: string;
  signedBase64: string;
  expectedSignature: string;
}

function validateRoutes(routes: HttpSenderRoute[]): void {
  if (
    routes.length < 1 ||
    routes.length > 5 ||
    new Set(routes.map((route) => route.id)).size !== routes.length
  ) {
    throw new Error('Provide 1 to 5 routes with unique IDs');
  }
  for (const route of routes) {
    if (!route.id.trim()) throw new Error('Route ID must not be empty');
    const url = new URL(route.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        'Route URL must use HTTP or HTTPS without embedded credentials',
      );
    }
    if (!Number.isSafeInteger(route.tipLamports) || route.tipLamports < 0)
      throw new Error('Invalid route tip lamports');
    if (route.tipLamports > 0 && !route.tipAccount)
      throw new Error('Tipped route requires a tip account');
    if (route.tipAccount) new PublicKey(route.tipAccount);
    // Validate every header before dispatching any route, including later entries.
    for (const [key, value] of Object.entries(route.headers ?? {})) {
      if (typeof value !== 'string')
        throw new Error('Route header values must be strings');
      new Headers({ [key]: value });
    }
  }
  const first = routes[0]!;
  if (
    (first.type ?? SwqosType.Default) !== SwqosType.Default ||
    first.tipLamports !== 0 ||
    first.tipAccount
  ) {
    throw new Error('First route must be an untipped default RPC route');
  }
}

function validateTransaction(transaction: VersionedTransaction): void {
  const { header, staticAccountKeys } = transaction.message;
  if (
    header.numRequiredSignatures !== 1 ||
    header.numReadonlySignedAccounts !== 0 ||
    transaction.signatures.length !== 1 ||
    !staticAccountKeys[0] ||
    header.numReadonlyUnsignedAccounts > staticAccountKeys.length - 1
  ) {
    throw new Error('Transaction must require only a writable payer signature');
  }
  const accountCount =
    staticAccountKeys.length +
    transaction.message.addressTableLookups.reduce(
      (count, lookup) =>
        count + lookup.readonlyIndexes.length + lookup.writableIndexes.length,
      0,
    );
  if (
    accountCount > 256 ||
    transaction.message.compiledInstructions.some(
      (instruction) =>
        instruction.programIdIndex >= staticAccountKeys.length ||
        instruction.accountKeyIndexes.some((index) => index >= accountCount),
    )
  ) {
    throw new Error('Transaction contains invalid account references');
  }
  if (transaction.serialize().length > 1232)
    throw new Error('Transaction exceeds 1232 bytes');
}

function decompile(
  transaction: VersionedTransaction,
  tables: AddressLookupTableAccount[],
): TransactionMessage {
  validateTransaction(transaction);
  return TransactionMessage.decompile(transaction.message, {
    addressLookupTableAccounts: tables,
  });
}

function assertDurableNonce(message: TransactionMessage): void {
  const first = message.instructions[0];
  const [nonce, sysvar, authority] = first?.keys ?? [];
  if (
    !first ||
    !first.programId.equals(SystemProgram.programId) ||
    first.data.length !== 4 ||
    first.data.readUInt32LE(0) !== 4 ||
    first.keys.length !== 3 ||
    !nonce?.isWritable ||
    nonce.isSigner ||
    nonce.pubkey.equals(message.payerKey) ||
    !sysvar?.pubkey.equals(SYSVAR_RECENT_BLOCKHASHES_PUBKEY) ||
    sysvar.isWritable ||
    sysvar.isSigner ||
    !authority?.pubkey.equals(message.payerKey) ||
    !authority.isSigner ||
    nonce.pubkey.equals(sysvar.pubkey) ||
    nonce.pubkey.equals(SystemProgram.programId)
  ) {
    throw new Error(
      'Multiple routes require a valid first nonce advance instruction authorized by the payer',
    );
  }
}

/** Local-only preparation. Wallet signing remains entirely caller-owned. */
export function prepareTransactionVariants(
  base: VersionedTransaction,
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): PreparedTransactionVariant[] {
  validateRoutes(routes);
  const clone = VersionedTransaction.deserialize(base.serialize());
  const message = decompile(clone, tables);
  if (routes.length > 1) assertDurableNonce(message);
  // Never carry signatures across preparation, even if the supplied base was signed.
  clone.signatures = clone.signatures.map(() => new Uint8Array(64));
  return routes.map((route) => ({
    routeId: route.id,
    transaction:
      route.tipLamports === 0
        ? VersionedTransaction.deserialize(clone.serialize())
        : compileTransaction({
            payer: message.payerKey,
            recentBlockhash: message.recentBlockhash,
            lookupTables: tables,
            instructions: [
              ...message.instructions,
              buildTipInstruction(
                message.payerKey,
                new PublicKey(route.tipAccount!),
                route.tipLamports,
              ),
            ],
          }),
  }));
}

/** Check exact messages against the untipped first variant; signatures are not modified. */
export function assertSenderVariants(
  variants: PreparedTransactionVariant[],
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): void {
  validateRoutes(routes);
  if (
    variants.length !== routes.length ||
    variants.some((variant, index) => variant.routeId !== routes[index]!.id)
  ) {
    throw new Error('Variants must match every configured route in order');
  }
  const expected = prepareTransactionVariants(
    variants[0]!.transaction,
    tables,
    routes,
  );
  variants.forEach((variant, index) => {
    validateTransaction(variant.transaction);
    if (
      !Buffer.from(variant.transaction.message.serialize()).equals(
        Buffer.from(expected[index]!.transaction.message.serialize()),
      )
    ) {
      throw new Error(
        'Sender variant differs from the base transaction and configured tip',
      );
    }
  });
}

/** Submit already signed bytes once per route, without signing, rebuilding or confirmation polling. */
export async function sendPreparedTransactions(
  routes: HttpSenderRoute[],
  variants: SignedTransactionVariant[],
  options: {
    minContextSlot: number;
    timeoutMs?: number;
    lookupTables?: AddressLookupTableAccount[];
  },
): Promise<{ routeId: string; accepted: boolean }[]> {
  validateRoutes(routes);
  if (
    !Number.isSafeInteger(options.minContextSlot) ||
    options.minContextSlot < 0 ||
    (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0))
  ) {
    throw new Error('Invalid HTTP submission options');
  }
  if (
    variants.length !== routes.length ||
    variants.some((variant, index) => variant.routeId !== routes[index]!.id)
  ) {
    throw new Error(
      'Signed variants must match every configured route in order',
    );
  }
  // Complete all validation and client construction before the first network request.
  const submissions = variants.map((variant, index) => {
    const bytes = Buffer.from(variant.signedBase64, 'base64');
    if (
      bytes.length > 1232 ||
      bytes.toString('base64') !== variant.signedBase64
    )
      throw new Error('Invalid canonical signed transaction bytes');
    const transaction = VersionedTransaction.deserialize(bytes);
    validateTransaction(transaction);
    if (!Buffer.from(transaction.serialize()).equals(bytes))
      throw new Error('Invalid canonical signed transaction bytes');
    const signature = transaction.signatures[0]!;
    if (
      bs58.encode(signature) !== variant.expectedSignature ||
      !nacl.sign.detached.verify(
        transaction.message.serialize(),
        signature,
        transaction.message.staticAccountKeys[0]!.toBytes(),
      )
    ) {
      throw new Error(
        'Signed transaction signature does not match the expected payer signature',
      );
    }
    const route = routes[index]!;
    const client = ClientFactory.createClient(
      {
        type: route.type ?? SwqosType.Default,
        customUrl: route.url,
        transport: SwqosTransport.Http,
        swqosOnly: route.swqosOnly,
      },
      route.url,
    );
    return {
      route,
      bytes,
      transaction,
      expectedSignature: variant.expectedSignature,
      client,
    };
  });
  assertSenderVariants(
    submissions.map(({ route, transaction }) => ({
      routeId: route.id,
      transaction,
    })),
    options.lookupTables ?? [],
    routes,
  );
  return Promise.all(
    submissions.map(async ({ route, bytes, expectedSignature, client }) => {
      try {
        const signature = await client.sendTransaction(
          TradeType.Buy,
          bytes,
          false,
          {
            minContextSlot: options.minContextSlot,
            timeoutMs: options.timeoutMs,
            headers: route.headers,
          },
        );
        return { routeId: route.id, accepted: signature === expectedSignature };
      } catch {
        // A timeout or error cannot establish whether the provider received the bytes.
        return { routeId: route.id, accepted: false };
      }
    }),
  );
}
