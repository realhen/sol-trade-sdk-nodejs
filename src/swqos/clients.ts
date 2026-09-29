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
import { TransactionV1 } from '../common/transaction-v1';
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

/** Appends a provider path while preserving query parameters and normalized root URLs. */
function submissionUrl(endpoint: string, path: string): string {
  const url = new URL(endpoint);
  const current = url.pathname.replace(/\/$/, '');
  url.pathname = current.endsWith(path) ? current : current + path;
  return url.toString();
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

export * from './metadata';
import { MIN_TIP_JITO, MIN_TIP_BLOXROUTE, MIN_TIP_ZERO_SLOT, MIN_TIP_TEMPORAL, MIN_TIP_FLASH_BLOCK, MIN_TIP_BLOCK_RAZOR, MIN_TIP_NODE1, MIN_TIP_ASTRALANE, MIN_TIP_HELIUS, MIN_TIP_HELIUS_NORMAL, MIN_TIP_STELLIUM, MIN_TIP_LIGHTSPEED, MIN_TIP_NEXT_BLOCK, MIN_TIP_SOYAS, MIN_TIP_SPEEDLANDING, MIN_TIP_SOLAMI, MIN_TIP_DEFAULT, JITO_TIP_ACCOUNTS, ZERO_SLOT_TIP_ACCOUNTS, TEMPORAL_TIP_ACCOUNTS, FLASH_BLOCK_TIP_ACCOUNTS, HELIUS_TIP_ACCOUNTS, NODE1_TIP_ACCOUNTS, BLOCK_RAZOR_TIP_ACCOUNTS, ASTRALANE_TIP_ACCOUNTS, BLOXROUTE_TIP_ACCOUNTS, STELLIUM_TIP_ACCOUNTS, NEXT_BLOCK_TIP_ACCOUNTS, SOYAS_TIP_ACCOUNTS, SPEEDLANDING_TIP_ACCOUNTS, SOLAMI_TIP_ACCOUNTS, JITO_ENDPOINTS, BLOXROUTE_ENDPOINTS, ZERO_SLOT_ENDPOINTS, TEMPORAL_ENDPOINTS, FLASH_BLOCK_ENDPOINTS, HELIUS_ENDPOINTS, NODE1_ENDPOINTS, BLOCK_RAZOR_ENDPOINTS, ASTRALANE_ENDPOINTS, ASTRALANE_QUIC_HOSTS, STELLIUM_ENDPOINTS, NEXT_BLOCK_ENDPOINTS, SOYAS_ENDPOINTS, SPEEDLANDING_ENDPOINTS, SOLAMI_ENDPOINTS } from './metadata';

// ===== SWQOS Client Interface =====

/** HTTP boundary time in epoch milliseconds, using the monotonic performance clock. */
export interface HttpSendTimingEvent {
  phase: 'dispatch' | 'response' | 'body' | 'error';
  at: number;
  /** Elapsed monotonic milliseconds since this request's fetch dispatch. */
  durationMs?: number;
  httpStatus?: number;
  rpcErrorCode?: number;
  requestBytes?: number;
  responseKind?: 'json' | 'text';
  providerSuccess?: boolean;
  /** Fixed classification only; never provider-controlled text, URLs or credentials. */
  reason?: 'timeout' | 'aborted' | 'network_error' | 'body_read_failed' | 'http_error' |
    'unauthorized' | 'rate_limited' | 'insufficient_tip' | 'rpc_error' | 'provider_rejected';
}

/** Classifies an untrusted response without retaining its text or arbitrary fields. */
function responseDiagnostic(body: unknown): Pick<HttpSendTimingEvent, 'rpcErrorCode' | 'reason' | 'providerSuccess'> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const envelope = body as Record<string, any>;
  const success = typeof envelope.success === 'boolean' ? { providerSuccess: envelope.success } : {};
  if (!envelope.error && envelope.success !== false) return success;
  const code = envelope.error?.code;
  const message = typeof envelope.error?.message === 'string' ? envelope.error.message : '';
  const reason: HttpSendTimingEvent['reason'] = /rate.?limit|too many requests/i.test(message)
    ? 'rate_limited'
    : /unauthori[sz]ed|forbidden|invalid.{0,20}(api.?key|token)/i.test(message)
      ? 'unauthorized'
      : /tip.{0,40}(minimum|low|small)|minimum.{0,40}tip/i.test(message)
        ? 'insufficient_tip'
        : envelope.error ? 'rpc_error' : 'provider_rejected';
  return { ...success, ...(Number.isSafeInteger(code) ? { rpcErrorCode: code } : {}), reason };
}

/** Options are local to one submission and never mutate the client. */
export interface HttpSendOptions {
  minContextSlot?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Synchronous diagnostic observer; keep it lightweight. Exceptions are ignored.
   * Response means HTTP headers arrived, not that the provider accepted the transaction.
   * Body means the response was read; error includes fetch or body-read failure.
   * Only fixed classifications and numeric status codes are exposed; response text is excluded.
   */
  onTiming?: (event: HttpSendTimingEvent) => void;
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
      let startedAt = performance.timeOrigin + performance.now();
      const requestBytes = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength;
      const notify = (phase: HttpSendTimingEvent['phase'], detail: Partial<HttpSendTimingEvent> = {}) => {
        if (!options.onTiming) return;
        try {
          const at = performance.timeOrigin + performance.now();
          if (phase === 'dispatch') startedAt = at;
          options.onTiming({ ...detail, phase, at, durationMs: at - startedAt });
        } catch {
          // Diagnostics must never change submission behavior or trigger retries.
        }
      };
      let response: Response;
      notify('dispatch', { requestBytes });
      try {
        response = await fetch(url, request);
      } catch (error) {
        notify('error', { reason: controller.signal.aborted ? (options.signal?.aborted ? 'aborted' : 'timeout') : 'network_error' });
        throw error;
      }
      notify('response', {
        httpStatus: response.status,
        ...(!response.ok ? { reason: response.status === 429 ? 'rate_limited' as const :
          response.status === 401 || response.status === 403 ? 'unauthorized' as const : 'http_error' as const } : {}),
      });
      if (!response.ok) throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
      let parsed: unknown;
      try {
        parsed = await parseBodyAsJsonOrText(response);
      } catch (error) {
        notify('error', { httpStatus: response.status, reason: controller.signal.aborted ?
          (options.signal?.aborted ? 'aborted' : 'timeout') : 'body_read_failed' });
        throw error;
      }
      notify('body', {
        httpStatus: response.status,
        responseKind: typeof parsed === 'string' ? 'text' : 'json',
        ...responseDiagnostic(parsed),
      });
      return parsed;
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

    const url = submissionUrl(this.endpoint, '/api/v2/submit');
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
      url = appendQuery(this.endpoint, { 'api-key': this.authToken });
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

    const url = submissionUrl(this.endpoint, '/api/v2/submit-batch');
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
      const endpoint = new URL(this.endpoint);
      endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/" + encodeURIComponent(this.authToken);
      url = endpoint.toString();
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

    const url = submissionUrl(this.endpoint, '/api/v2/submit');
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
  if (data[0] === 0x81) {
    const transaction = TransactionV1.deserialize(data);
    if (transaction.signatures.length !== 1) {
      throw new TradeError(400, 'Only single-signature transactions are supported for SWQOS submit');
    }
    return bs58.encode(transaction.signatures[0]!);
  }
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
        return new LightspeedClient(rpcUrl, appendQuery(config.customUrl, { api_key: config.apiKey }));
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
