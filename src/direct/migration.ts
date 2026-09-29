/** Authenticated launchpad handoff discovery. No signing, submission, or pool scans. */
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import bs58 from "bs58";
import type BN from "bn.js";
import { type Connection, PublicKey } from "@solana/web3.js";
import {
  canonicalPumpPoolPda,
  PUMP_AMM_PROGRAM_ID,
  PUMP_PROGRAM_ID,
} from "@pump-fun/pump-swap-sdk";
import {
  DynamicBondingCurveIdl,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DAMM_V1_MIGRATION_FEE_ADDRESS,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DAMM_V1_PROGRAM_ID,
  DAMM_V2_PROGRAM_ID,
  deriveDbcPoolAddress,
  deriveDammV1PoolAddress,
  deriveDammV2PoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { LaunchpadPool } from "@raydium-io/raydium-sdk-v2";
import { RAYDIUM_CPMM_PROGRAM_ID } from "../instruction/raydium_cpmm_builder";
import { RAYDIUM_AMM_V4_PROGRAM_ID } from "../instruction/raydium_amm_v4_builder";
import { BONK_PROGRAM_ID } from "../instruction/bonk_builder";
import { discoverPoolQuoteMint } from "./pool-identity";

/** Migration state is identity discovery, not proof that destination swaps are ready. */
export interface DirectMigration {
  readonly state: "active" | "migrating" | "migrated" | "unsupported";
  readonly destination?: PublicKey;
  readonly quoteMint?: PublicKey;
}
const dbcCoder = new BorshAccountsCoder(
  DynamicBondingCurveIdl as unknown as Idl,
);
interface DbcPool {
  pool_state: {
    config: PublicKey;
    base_mint: PublicKey;
    quote_reserve: BN;
    is_migrated: number;
    migration_progress: number;
  };
}
interface DbcConfig {
  quote_mint: PublicKey;
  migration_option: number;
  migration_fee_option: number;
  migration_quote_threshold: BN;
}
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Migration discovery: ${message}`);
}

/** Inspect a launchpad's canonical handoff using authenticated source/config state.
 * @remarks Reads through the supplied connection, including a missing predicted
 * destination, so recording/cache-only connections can subscribe before migration.
 * A migrated result must still pass prepareDirectMarket before trading. Completed
 * sources return migrating until an authenticated destination exists. Unknown
 * destination schemes fail closed; unsupported applies only to non-launchpad owners.
 * @throws Rejects missing dependencies, malformed identities, or conflicting destinations.
 */
export async function inspectDirectMigration(
  connection: Pick<Connection, "getAccountInfo">,
  sourcePool: PublicKey,
  mint: PublicKey,
  resolvedDestination?: ResolvedDirectMigration,
): Promise<DirectMigration> {
  const source = await connection.getAccountInfo(sourcePool, "confirmed");
  requireState(source && !source.executable, "missing source pool");
  if (
    !source.owner.equals(PUMP_PROGRAM_ID) &&
    !source.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID) &&
    !source.owner.equals(BONK_PROGRAM_ID)
  )
    return { state: "unsupported" };
  const quoteMint = await discoverPoolQuoteMint(connection, sourcePool, mint);
  let complete: boolean;
  let migrationCommitted = true;
  let destination: PublicKey | undefined;
  let destinationProgram: PublicKey | undefined;
  if (source.owner.equals(PUMP_PROGRAM_ID)) {
    complete = source.data[48] === 1;
    destination = canonicalPumpPoolPda(mint, quoteMint);
    destinationProgram = PUMP_AMM_PROGRAM_ID;
  } else if (source.owner.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) {
    const { pool_state: pool } = dbcCoder.decode<DbcPool>(
      "VirtualPool",
      Buffer.from(source.data),
    );
    const configInfo = await connection.getAccountInfo(
      pool.config,
      "confirmed",
    );
    requireState(
      configInfo &&
        !configInfo.executable &&
        configInfo.owner.equals(source.owner),
      "invalid DBC config owner",
    );
    const config = dbcCoder.decode<DbcConfig>(
      "PoolConfig",
      Buffer.from(configInfo.data),
    );
    requireState(
      deriveDbcPoolAddress(
        config.quote_mint,
        pool.base_mint,
        pool.config,
      ).equals(sourcePool),
      "DBC source address mismatch",
    );
    complete =
      pool.is_migrated !== 0 ||
      pool.migration_progress !== 0 ||
      pool.quote_reserve.gte(config.migration_quote_threshold);
    migrationCommitted = pool.is_migrated !== 0;
    const configs =
      config.migration_option === 0
        ? DAMM_V1_MIGRATION_FEE_ADDRESS
        : config.migration_option === 1
          ? DAMM_V2_MIGRATION_FEE_ADDRESS
          : [];
    const migrationConfig = configs[config.migration_fee_option];
    if (migrationConfig) {
      destination =
        config.migration_option === 0
          ? deriveDammV1PoolAddress(
              migrationConfig,
              pool.base_mint,
              config.quote_mint,
            )
          : deriveDammV2PoolAddress(
              migrationConfig,
              pool.base_mint,
              config.quote_mint,
            );
      destinationProgram =
        config.migration_option === 0 ? DAMM_V1_PROGRAM_ID : DAMM_V2_PROGRAM_ID;
    }
  } else {
    const pool = LaunchpadPool.decode(source.data);
    complete = pool.status !== 0 || pool.realA.gte(pool.totalSellA);
    if (resolvedDestination) {
      const proof = migrationProofs.get(resolvedDestination);
      requireState(
        proof &&
          proof.source.equals(sourcePool) &&
          proof.mint.equals(mint) &&
          proof.quote.equals(quoteMint) &&
          proof.migrateType === pool.migrateType,
        "invalid migration evidence",
      );
      destination = proof.destination;
      destinationProgram = proof.program;
    }
  }
  if (!destination || !destinationProgram)
    return { state: complete ? "migrating" : "active", quoteMint };
  const target = await connection.getAccountInfo(destination, "confirmed");
  if (!target)
    return { state: complete ? "migrating" : "active", destination, quoteMint };
  requireState(
    !target.executable && target.owner.equals(destinationProgram),
    "destination owner mismatch",
  );
  requireState(
    (await discoverPoolQuoteMint(connection, destination, mint)).equals(
      quoteMint,
    ),
    "destination pair mismatch",
  );
  return {
    state: complete
      ? migrationCommitted
        ? "migrated"
        : "migrating"
      : "active",
    destination,
    quoteMint,
  };
}

/** Opaque confirmed migration evidence, scoped to the source and pair in this SDK instance. */
export interface ResolvedDirectMigration {
  readonly signature: string;
}
const migrationProofs = new WeakMap<
  ResolvedDirectMigration,
  {
    source: PublicKey;
    mint: PublicKey;
    quote: PublicKey;
    destination: PublicKey;
    program: PublicKey;
    migrateType: number;
  }
>();

interface Invocation {
  program: string;
  depth: number;
  success: boolean;
  parent?: Invocation;
}
/** Runtime log frames must close successfully through every ancestor before CPI state commits. */
function successfulLaunchpadInvocations(
  logs: readonly string[] | null | undefined,
  depths: readonly (number | null | undefined)[],
): boolean[] {
  const stack: Invocation[] = [],
    targets: Invocation[] = [];
  if (!logs) return [];
  for (const line of logs) {
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/.exec(
      line,
    );
    if (invoke) {
      const depth = Number(invoke[2]);
      if (depth !== stack.length + 1) return [];
      const frame: Invocation = {
        program: invoke[1]!,
        depth,
        success: false,
        parent: stack[stack.length - 1],
      };
      stack.push(frame);
      if (frame.program === BONK_PROGRAM_ID.toBase58()) targets.push(frame);
      continue;
    }
    const finish = /^Program ([1-9A-HJ-NP-Za-km-z]+) (success|failed:.*)$/.exec(
      line,
    );
    if (finish) {
      const frame = stack.pop();
      if (!frame || frame.program !== finish[1]) return [];
      frame.success = finish[2] === "success";
    }
  }
  if (
    stack.length ||
    targets.length !== depths.length ||
    targets.some((frame, index) => frame.depth !== depths[index])
  )
    return [];
  return targets.map((frame) => {
    for (
      let ancestor: Invocation | undefined = frame;
      ancestor;
      ancestor = ancestor.parent
    )
      if (!ancestor.success) return false;
    return true;
  });
}

/** Resolve non-derivable LaunchLab destinations from successful confirmed migration instructions.
 * @remarks Performs bounded live RPC history reads (20 recent source signatures).
 * Returns undefined while no migration evidence is visible; callers may retry.
 * CPI evidence requires complete runtime invocation logs matching instruction order
 * and depth, with success through every ancestor. Missing/truncated logs fail closed.
 * No token-pair scan or unsigned caller-supplied destination is trusted.
 * @throws Rejects RPC failures or malformed/conflicting source/destination identity.
 */
export async function resolveDirectMigration(
  connection: Connection,
  sourcePool: PublicKey,
  mint: PublicKey,
): Promise<ResolvedDirectMigration | undefined> {
  const source = await connection.getAccountInfo(sourcePool, "confirmed");
  requireState(
    source && source.owner.equals(BONK_PROGRAM_ID) && !source.executable,
    "invalid LaunchLab source",
  );
  const quote = await discoverPoolQuoteMint(connection, sourcePool, mint);
  const pool = LaunchpadPool.decode(source.data);
  if (pool.status === 0 && pool.realA.lt(pool.totalSellA)) return undefined;
  const signatures = await connection.getSignaturesForAddress(
    sourcePool,
    { limit: 20 },
    "confirmed",
  );
  for (const signature of signatures) {
    if (signature.err) continue;
    const tx = await connection.getTransaction(signature.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta || tx.meta.err) continue;
    const message = tx.transaction.message;
    const keys = message.getAccountKeys({
      accountKeysFromLookups: tx.meta.loadedAddresses,
    });
    const instructions = message.compiledInstructions
      .flatMap((ix, index) => [
        {
          programIdIndex: ix.programIdIndex,
          accounts: ix.accountKeyIndexes,
          data: Buffer.from(ix.data),
          depth: 1 as number | null | undefined,
        },
        ...(
          tx.meta!.innerInstructions?.find((group) => group.index === index)
            ?.instructions ?? []
        ).map((inner) => ({
          programIdIndex: inner.programIdIndex,
          accounts: inner.accounts,
          data: Buffer.from(bs58.decode(inner.data)),
          depth: (inner as typeof inner & { stackHeight?: number | null })
            .stackHeight,
        })),
      ])
      .filter((ix) => keys.get(ix.programIdIndex)?.equals(BONK_PROGRAM_ID));
    const successes = successfulLaunchpadInvocations(
      tx.meta.logMessages,
      instructions.map((ix) => ix.depth),
    );
    for (const [index, ix] of instructions.entries()) {
      if (ix.depth !== 1 && !successes[index]) continue;
      const amm = ix.data
        .subarray(0, 8)
        .equals(Buffer.from([207, 82, 192, 145, 254, 207, 145, 223]));
      const cpmm = ix.data
        .subarray(0, 8)
        .equals(Buffer.from([136, 92, 200, 103, 28, 218, 144, 140]));
      if ((!amm && !cpmm) || pool.migrateType !== (amm ? 0 : 1)) continue;
      const account = (index: number) =>
        ix.accounts[index] === undefined
          ? undefined
          : keys.get(ix.accounts[index]);
      const program = amm ? RAYDIUM_AMM_V4_PROGRAM_ID : RAYDIUM_CPMM_PROGRAM_ID;
      const destination = account(amm ? 13 : 5);
      if (
        !destination ||
        !account(amm ? 23 : 17)?.equals(sourcePool) ||
        !account(1)?.equals(pool.mintA) ||
        !account(2)?.equals(pool.mintB) ||
        !account(amm ? 12 : 4)?.equals(program) ||
        !account(amm ? 24 : 18)?.equals(pool.configId)
      )
        continue;
      const target = await connection.getAccountInfo(destination, "confirmed");
      requireState(
        target && !target.executable && target.owner.equals(program),
        "invalid confirmed migration destination",
      );
      requireState(
        (await discoverPoolQuoteMint(connection, destination, mint)).equals(
          quote,
        ),
        "confirmed migration pair mismatch",
      );
      const evidence = Object.freeze({ signature: signature.signature });
      migrationProofs.set(evidence, {
        source: sourcePool,
        mint,
        quote,
        destination,
        program,
        migrateType: pool.migrateType,
      });
      return evidence;
    }
  }
  return undefined;
}
