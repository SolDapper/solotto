declare module "solotto" {
  import { Connection, PublicKey, Keypair, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
  import { EventEmitter } from "events";

  // ── Shared Types ──────────────────────────────────────────────────────

  type PriorityLevel = "Low" | "Medium" | "High" | "VeryHigh" | "Extreme";

  interface TxParams {
    /** Payer public key as a base-58 string. */
    account: string;
    /** Array of transaction instructions. */
    instructions: TransactionInstruction[];
    /** Keypairs to pre-sign the transaction, or `false`. */
    signers?: Keypair[] | false;
    /** Priority fee level. Defaults to `"Low"`. */
    priority?: PriorityLevel;
    /** Compute unit safety multiplier. Defaults to `1.1`. */
    tolerance?: number | false;
    /** If `true`, serialize the transaction to a `Uint8Array`. */
    serialize?: boolean;
    /** If `true`, base64-encode the serialized transaction. */
    encode?: boolean;
    /** If `true`, simulate and optimise compute units. Defaults to `true`. */
    compute?: boolean;
    /** If `true`, estimate and set priority fees. Defaults to `true`. */
    fees?: boolean;
    /** Address Lookup Table account, or `false`. */
    table?: any | false;
    /** Optional memo string, or `false`. */
    memo?: string | false;
  }

  interface TxResult {
    status: "ok" | "error";
    message: string;
    transaction?: VersionedTransaction | Uint8Array | string;
  }

  interface SimulationError {
    status: "error";
    message: string;
    details?: any;
    logs?: string[];
  }

  interface SendError {
    status: "error";
    message: any;
  }

  // ── Lottery State ─────────────────────────────────────────────────────

  interface LotteryState {
    /** Lottery authority public key. */
    authority: string;
    /** Lottery numeric identifier. */
    lotteryId: number;
    /** Ticket price in lamports. */
    ticketPrice: number;
    /** Total number of tickets sold. */
    totalTickets: number;
    /** Winning ticket number, or `0`/`null` if not yet drawn. */
    winnerTicketNumber: number | null;
    /** Winner's public key, or `null` if not yet drawn. */
    winnerAddress: string | null;
    /** Whether the lottery is currently active. */
    isActive: boolean;
    /** Prize pool balance in lamports (net of fees when `fees` param is `true`). */
    prizePoolBalance: number;
    /** Whether a draw has been initiated. */
    drawInitiated: boolean;
    /** Prize pool PDA as a base-58 string. */
    prizePoolAddress: string;
    /** Lottery PDA as a base-58 string. */
    lotteryAddress: string;
  }

  // ── Ticket State ──────────────────────────────────────────────────────

  interface TicketInfo {
    /** Ticket owner public key. */
    ticketOwner: string;
    /** Ticket receipt account public key. */
    ticketReceipt: string;
    /** The ticket number. */
    ticketNumber: number;
    /** Ticket PDA as a base-58 string. */
    ticketPda: string;
    /** Lottery numeric identifier. */
    lotteryId: number;
    /** Lottery PDA as a base-58 string. */
    lotteryAddress: string;
    /** Lottery authority public key. */
    lotteryAuth: string;
  }

  interface TicketListItem {
    owner: string;
    lottery: string;
    ticketReceipt: string;
    ticketNumber: number;
    ticketPda: string;
  }

  interface TicketListResult {
    lotteryId: number;
    lotteryAddress: string;
    lotteryAuth: string;
    /** The buyer's public key, or `"All"` if unfiltered. */
    buyer: string;
    /** Tickets sorted descending by ticket number. */
    tickets: TicketListItem[];
  }

  // ── WatchDraw Events ──────────────────────────────────────────────────

  interface DrawEvent {
    /** The winning ticket number. */
    winningTicketNumber: number;
    /** The on-chain transaction signature. */
    signature: string;
  }

  interface ReconnectingEvent {
    /** Delay in milliseconds before the next reconnection attempt. */
    delay: number;
  }

  interface LotteryEvents {
    draw: (event: DrawEvent) => void;
    connected: () => void;
    error: (err: any) => void;
    reconnecting: (event: ReconnectingEvent) => void;
  }

  // ── Authority-like objects ────────────────────────────────────────────

  /** An object with at least a `publicKey` property (e.g. a Keypair without the secret key). */
  interface HasPublicKey {
    publicKey: PublicKey;
  }

  // ── Classes ───────────────────────────────────────────────────────────

  /**
   * Low-level transaction builder, sender, and confirmation poller.
   */
  export class LotteryNetwork {
    connection: Connection;

    constructor(connection: Connection);

    /** Build a versioned transaction with automatic compute and fee estimation. */
    Tx(params: TxParams): Promise<TxResult | SimulationError>;

    /** Send a signed transaction to the network. */
    Send(tx: VersionedTransaction): Promise<string | SendError>;

    /**
     * Poll for transaction confirmation.
     * @param sig   - Transaction signature.
     * @param max   - Maximum polling attempts (default `10`).
     * @param int   - Seconds between polls (default `3`).
     */
    Status(sig: string, max?: number, int?: number): Promise<string>;

    /** Simulate a transaction and return the optimised compute unit limit. */
    Compute(
      payer: PublicKey,
      ix: TransactionInstruction[],
      tolerance: number,
      blockhash: string,
      table?: any[] | false
    ): Promise<number | SimulationError>;

    /** Estimate priority fees for a transaction. */
    Estimate(
      payer: HasPublicKey,
      priority_level: PriorityLevel,
      instructions: TransactionInstruction[],
      blockhash: string,
      table?: any[] | false
    ): Promise<number>;
  }

  /**
   * Player and read operations — buy tickets, claim prizes, query state,
   * and watch draws via WebSocket. Extends `EventEmitter`.
   */
  export class Lottery extends EventEmitter {
    connection: Connection;
    wss: string | false;
    program: PublicKey;

    constructor(connection: Connection, wss: string | false, program: PublicKey);

    // ── Event emitter overrides for type-safe listeners ──

    on<K extends keyof LotteryEvents>(event: K, listener: LotteryEvents[K]): this;
    once<K extends keyof LotteryEvents>(event: K, listener: LotteryEvents[K]): this;
    off<K extends keyof LotteryEvents>(event: K, listener: LotteryEvents[K]): this;
    emit<K extends keyof LotteryEvents>(event: K, ...args: Parameters<LotteryEvents[K]>): boolean;

    /** Start a WebSocket subscription for real-time draw events. Auto-reconnects on failure. */
    WatchDraw(): Promise<void>;

    /**
     * Buy one or more tickets.
     * @param buyer     - The ticket buyer's keypair.
     * @param authority - The lottery authority (only `publicKey` required).
     * @param lotteryId - Lottery numeric identifier.
     * @param amount    - Number of tickets to buy (1–4, default `1`).
     * @param encoded   - If `true`, return a base64-encoded transaction.
     */
    BuyTickets(
      buyer: Keypair,
      authority: HasPublicKey,
      lotteryId: number,
      amount?: number,
      encoded?: boolean
    ): Promise<string | TxResult>;

    /**
     * Claim the prize for the winning ticket.
     * @param authority - The lottery authority (only `publicKey` required).
     * @param lotteryId - Lottery numeric identifier.
     * @param winner    - The winning ticket owner's keypair.
     * @param encoded   - If `true`, return a base64-encoded transaction.
     */
    ClaimTicket(
      authority: HasPublicKey,
      lotteryId: number,
      winner: Keypair,
      encoded?: boolean
    ): Promise<string | TxResult>;

    /** Fetch the on-chain state of a lottery. */
    GetLottery(
      authority: HasPublicKey,
      lotteryId: number,
      fees?: boolean
    ): Promise<LotteryState>;

    /** Fetch a single ticket by its ticket number. */
    GetTicket(
      authority: HasPublicKey,
      lotteryId: number,
      ticket: number
    ): Promise<TicketInfo>;

    /** Fetch all tickets for a lottery, optionally filtered by buyer. */
    GetTickets(
      authority: HasPublicKey,
      lotteryId: number,
      buyer?: HasPublicKey | false
    ): Promise<TicketListResult>;

    /** Derive the lottery PDA. */
    DeriveLotteryPDA(
      authority: PublicKey,
      lotteryId: number
    ): Promise<[PublicKey, number]>;

    /** Derive a ticket PDA. */
    DeriveTicketPDA(
      lotteryPDA: PublicKey,
      buyer: PublicKey,
      ticketReceipt: PublicKey
    ): Promise<[PublicKey, number]>;

    /** Derive the prize pool PDA. */
    DerivePrizePoolPDA(): Promise<[PublicKey, number]>;
  }

  /**
   * Admin operations — initialize lotteries, trigger draws, lock/unlock ticket sales.
   */
  export class LotteryManager {
    connection: Connection;
    program: PublicKey;

    constructor(connection: Connection, program: PublicKey);

    /**
     * Create a new on-chain lottery.
     * @param authority   - The authority keypair that will own the lottery.
     * @param ticketPrice - Ticket price in lamports.
     * @param lotteryId   - A unique numeric lottery identifier.
     * @param encoded     - If `true`, return a base64-encoded transaction.
     */
    Initialize(
      authority: Keypair,
      ticketPrice: number,
      lotteryId: number,
      encoded?: boolean
    ): Promise<string | TxResult>;

    /**
     * Trigger the on-chain random draw to select a winner.
     * @param authority - The lottery authority keypair.
     * @param lotteryId - Lottery numeric identifier.
     * @param encoded   - If `true`, return a base64-encoded transaction.
     */
    RandomDraw(
      authority: Keypair,
      lotteryId: number,
      encoded?: boolean
    ): Promise<LotteryState | string | TxResult | undefined>;

    /**
     * Lock or unlock ticket sales.
     * @param authority - The lottery authority keypair.
     * @param lotteryId - Lottery numeric identifier.
     * @param lockState - `0` to lock (stop sales), `1` to unlock.
     * @param encoded   - If `true`, return a base64-encoded transaction.
     */
    LockLottery(
      authority: Keypair,
      lotteryId: number,
      lockState: 0 | 1,
      encoded?: boolean
    ): Promise<LotteryState | string | TxResult | undefined>;
  }
}
