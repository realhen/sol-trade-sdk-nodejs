import {
  TransactionV1,
  compileV1Transaction,
  decompileV1Transaction,
} from "../common/transaction-v1";
type PreparedTransaction = VersionedTransaction | TransactionV1;
function decodePrepared(bytes: Uint8Array): PreparedTransaction {
  return bytes[0] === 0x81
    ? TransactionV1.deserialize(bytes)
    : VersionedTransaction.deserialize(bytes);
}
import { Buffer } from "buffer";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519";
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildTipInstruction,
  compileTransaction,
  type CompileTransactionOptions,
} from "../common/transaction";
import { SwqosTransport, SwqosType, TradeType } from "../enums";
import { ClientFactory, type HttpSendTimingEvent } from "./clients";

export interface HttpSenderRoute {
  id: string;
  name: string;
  url: string;
  tipAccount?: string;
  tipLamports: number;
  headers?: Record<string, string>;
  /** Provider credential; caller must keep routes in a trusted context. */
  apiKey?: string;
  type?: `${SwqosType}`;
  swqosOnly?: boolean;
}

export interface PreparedTransactionVariant<
  T extends PreparedTransaction = PreparedTransaction,
> {
  routeId: string;
  transaction: T;
}

/** Per-route HTTP and submission result markers; accepted does not mean chain confirmation. */
export interface PreparedTransactionTimingEvent extends Omit<HttpSendTimingEvent, "phase" | "reason"> {
  routeId: string;
  phase: HttpSendTimingEvent["phase"] | "accepted" | "rejected";
  at: number;
  /** The locally verified transaction signature, never arbitrary response text. */
  signature?: string;
  reason?: HttpSendTimingEvent["reason"] | "signature_mismatch" | "invalid_response";
}

export interface SignedTransactionVariant {
  routeId: string;
  signedBase64: string;
  expectedSignature: string;
}

/** Bounded fan-out supports all HTTP providers and multiple credentials per provider. */
export { MAX_HTTP_SENDER_ROUTES } from "./metadata";
import { MAX_HTTP_SENDER_ROUTES } from "./metadata";

function validateRoutes(routes: HttpSenderRoute[]): void {
  if (
    routes.length < 1 ||
    routes.length > MAX_HTTP_SENDER_ROUTES ||
    new Set(routes.map((route) => route.id)).size !== routes.length
  ) {
    throw new Error(
      `Provide 1 to ${MAX_HTTP_SENDER_ROUTES} routes with unique IDs`,
    );
  }
  for (const route of routes) {
    if (
      route.apiKey !== undefined &&
      (typeof route.apiKey !== "string" ||
        !/^[\x21-\x7e]{1,2048}$/.test(route.apiKey))
    ) {
      throw new Error("Invalid sender API key");
    }
    if (!route.id.trim()) throw new Error("Route ID must not be empty");
    const url = new URL(route.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "Route URL must use HTTP or HTTPS without embedded credentials",
      );
    }
    if (!Number.isSafeInteger(route.tipLamports) || route.tipLamports < 0)
      throw new Error("Invalid route tip lamports");
    if (route.tipLamports > 0 && !route.tipAccount)
      throw new Error("Tipped route requires a tip account");
    if (route.tipAccount) new PublicKey(route.tipAccount);
    // Validate every header before dispatching any route, including later entries.
    for (const [key, value] of Object.entries(route.headers ?? {})) {
      if (typeof value !== "string")
        throw new Error("Route header values must be strings");
      new Headers({ [key]: value });
    }
  }
  const first = routes[0]!;
  if (
    (first.type ?? SwqosType.Default) !== SwqosType.Default ||
    first.tipLamports !== 0 ||
    first.tipAccount
  ) {
    throw new Error("First route must be an untipped default RPC route");
  }
}

function validateTransaction(transaction: PreparedTransaction): void {
  const { header, staticAccountKeys } = transaction.message;
  if (
    header.numRequiredSignatures !== 1 ||
    header.numReadonlySignedAccounts !== 0 ||
    transaction.signatures.length !== 1 ||
    !staticAccountKeys[0] ||
    header.numReadonlyUnsignedAccounts > staticAccountKeys.length - 1
  ) {
    throw new Error("Transaction must require only a writable payer signature");
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
    throw new Error("Transaction contains invalid account references");
  }
  if (
    transaction.serialize().length > (transaction.version === 1 ? 4096 : 1232)
  )
    throw new Error("Transaction exceeds its format size limit");
}

function decompile(
  transaction: PreparedTransaction,
  tables: AddressLookupTableAccount[],
): TransactionMessage {
  validateTransaction(transaction);
  if (transaction instanceof TransactionV1)
    return decompileV1Transaction(transaction);
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
      "Multiple routes require a valid first nonce advance instruction authorized by the payer",
    );
  }
}

/** Local-only preparation. Wallet signing remains entirely caller-owned. */
export function prepareTransactionVariants(
  base: TransactionV1,
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): PreparedTransactionVariant<TransactionV1>[];
export function prepareTransactionVariants(
  base: VersionedTransaction,
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): PreparedTransactionVariant<VersionedTransaction>[];
export function prepareTransactionVariants(
  base: PreparedTransaction,
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): PreparedTransactionVariant[];
export function prepareTransactionVariants(
  base: PreparedTransaction,
  tables: AddressLookupTableAccount[],
  routes: HttpSenderRoute[],
): PreparedTransactionVariant[] {
  validateRoutes(routes);
  const clone = decodePrepared(base.serialize());
  if (routes.length === 1 && routes[0]!.tipLamports === 0) {
    validateTransaction(clone);
    if (!(clone instanceof TransactionV1)) decompile(clone, tables);
    clone.signatures = clone.signatures.map(() => new Uint8Array(64));
    return [{ routeId: routes[0]!.id, transaction: clone }];
  }
  const message = decompile(clone, tables);
  if (routes.length > 1) assertDurableNonce(message);
  // Never carry signatures across preparation, even if the supplied base was signed.
  clone.signatures = clone.signatures.map(() => new Uint8Array(64));
  return routes.map((route) => ({
    routeId: route.id,
    transaction:
      route.tipLamports === 0
        ? decodePrepared(clone.serialize())
        : (clone instanceof TransactionV1
            ? (options: CompileTransactionOptions) =>
                compileV1Transaction({
                  ...options,
                  config: clone.message.config,
                })
            : compileTransaction)({
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
    throw new Error("Variants must match every configured route in order");
  }
  if (routes.length === 1 && routes[0]!.tipLamports === 0) {
    const transaction = variants[0]!.transaction;
    validateTransaction(transaction);
    if (!(transaction instanceof TransactionV1)) decompile(transaction, tables);
    return;
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
        "Sender variant differs from the base transaction and configured tip",
      );
    }
  });
}

/** Options snapshotted during signed-submission preparation. */
export interface SignedTransactionSubmissionOptions {
  minContextSlot: number;
  timeoutMs?: number;
  lookupTables?: AddressLookupTableAccount[];
  /** Keep this synchronous observer lightweight; exceptions are ignored.
   * A response marker is HTTP arrival, not a transaction acceptance or confirmation.
   * Accepted/rejected mark each route's parsed result without waiting for other routes.
   * Rejected includes uncertain transport failures; it does not prove non-delivery.
   */
  onTiming?: (event: PreparedTransactionTimingEvent) => void;
}

/** One-shot network dispatch. Repeated calls throw without sending again. */
export type PreparedSignedTransactionSubmission = () => Promise<
  { routeId: string; accepted: boolean }[]
>;

/** Validates signed variants and constructs clients synchronously without network requests.
 * The returned one-shot closure retains private snapshots of bytes, routes and options.
 * Prepare every wallet before dispatching a batch to keep validation out of its send window.
 */
export function prepareSignedTransactionSubmission(
  routes: HttpSenderRoute[],
  variants: SignedTransactionVariant[],
  options: SignedTransactionSubmissionOptions,
): PreparedSignedTransactionSubmission {
  routes = routes.map((route) => ({
    ...route,
    ...(route.headers ? { headers: { ...route.headers } } : {}),
  }));
  variants = variants.map((variant) => ({ ...variant }));
  options = { ...options };
  validateRoutes(routes);
  if (
    !Number.isSafeInteger(options.minContextSlot) ||
    options.minContextSlot < 0 ||
    (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0))
  ) {
    throw new Error("Invalid HTTP submission options");
  }
  if (
    variants.length !== routes.length ||
    variants.some((variant, index) => variant.routeId !== routes[index]!.id)
  ) {
    throw new Error(
      "Signed variants must match every configured route in order",
    );
  }
  // Complete all validation and client construction before the first network request.
  const submissions = variants.map((variant, index) => {
    const bytes = Buffer.from(variant.signedBase64, "base64");
    if (
      bytes.length > (bytes[0] === 0x81 ? 4096 : 1232) ||
      bytes.toString("base64") !== variant.signedBase64
    )
      throw new Error("Invalid canonical signed transaction bytes");
    const transaction = decodePrepared(bytes);
    validateTransaction(transaction);
    if (!Buffer.from(transaction.serialize()).equals(bytes))
      throw new Error("Invalid canonical signed transaction bytes");
    const signature = transaction.signatures[0]!;
    if (
      bs58.encode(signature) !== variant.expectedSignature ||
      !ed25519.verify(
        signature,
        transaction.message.serialize(),
        transaction.message.staticAccountKeys[0]!.toBytes(),
      )
    ) {
      throw new Error(
        "Signed transaction signature does not match the expected payer signature",
      );
    }
    const route = routes[index]!;
    const client = ClientFactory.createClient(
      {
        type: (route.type ?? SwqosType.Default) as SwqosType,
        apiKey: route.apiKey,
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
  let dispatched = false;
  return () => {
    if (dispatched)
      throw new Error("Prepared submission has already been dispatched");
    dispatched = true;
    return Promise.all(
      submissions.map(async ({ route, bytes, expectedSignature, client }) => {
        let lastEvent: HttpSendTimingEvent | undefined;
        let dispatchedAt: number | undefined;
        const notifyResult = (accepted: boolean, reason?: PreparedTransactionTimingEvent["reason"]) => {
          if (!options.onTiming) return;
          try {
            const at = performance.timeOrigin + performance.now();
            options.onTiming({
              routeId: route.id,
              phase: accepted ? "accepted" : "rejected",
              at,
              ...(dispatchedAt === undefined ? {} : { durationMs: at - dispatchedAt }),
              signature: expectedSignature,
              httpStatus: lastEvent?.httpStatus,
              rpcErrorCode: lastEvent?.rpcErrorCode,
              responseKind: lastEvent?.responseKind,
              providerSuccess: lastEvent?.providerSuccess,
              ...(reason ? { reason } : {}),
            });
          } catch {
            // Observer failures must not turn acceptance into rejection.
          }
        };
        try {
          const signature = await client.sendTransaction(
            TradeType.Buy,
            bytes,
            false,
            {
              minContextSlot: options.minContextSlot,
              timeoutMs: options.timeoutMs,
              headers: route.headers,
              onTiming: options.onTiming
                ? (event) => {
                    if (event.phase === "dispatch") dispatchedAt = event.at;
                    lastEvent = { ...lastEvent, ...event };
                    options.onTiming!({ routeId: route.id, ...event, signature: expectedSignature });
                  }
                : undefined,
            },
          );
          const accepted = signature === expectedSignature;
          notifyResult(accepted, accepted ? undefined : "signature_mismatch");
          return { routeId: route.id, accepted };
        } catch {
          // A timeout or error cannot establish whether the provider received the bytes.
          notifyResult(false, lastEvent?.reason ?? "invalid_response");
          return { routeId: route.id, accepted: false };
        }
      }),
    );
  };
}

/** Submit already signed bytes once per route, without signing, rebuilding or confirmation polling. */
export async function sendPreparedTransactions(
  routes: HttpSenderRoute[],
  variants: SignedTransactionVariant[],
  options: SignedTransactionSubmissionOptions,
): Promise<{ routeId: string; accepted: boolean }[]> {
  return prepareSignedTransactionSubmission(routes, variants, options)();
}
