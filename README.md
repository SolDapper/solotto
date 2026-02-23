# Solotto

A JavaScript SDK for interacting with the Solotto on-chain lottery program on Solana. Solotto provides a complete interface for creating lotteries, buying tickets, drawing winners, claiming prizes, and querying lottery state — all backed by a Solana smart contract.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Classes](#classes)
  - [LotteryManager](#lotterymanager)
  - [Lottery](#lottery)
  - [LotteryNetwork](#lotterynetwork)
- [API Reference](#api-reference)
  - [LotteryManager](#lotterymanager-api)
    - [Initialize](#initialize)
    - [RandomDraw](#randomdraw)
    - [LockLottery](#locklottery)
    - [ClaimExpired](#claimexpired)
  - [Lottery](#lottery-api)
    - [BuyTickets](#buytickets)
    - [ClaimTicket](#claimticket)
    - [Boost](#boost)
    - [GetBoosters](#getboosters)
    - [GetMessages](#getmessages)
    - [GetLottery](#getlottery)
    - [GetLotteries](#getlotteries)
    - [GetTicket](#getticket)
    - [GetTickets](#gettickets)
    - [WatchDraw](#watchdraw)
  - [LotteryNetwork](#lotterynetwork-api)
    - [Tx](#tx)
    - [Send](#send)
    - [Status](#status)
    - [Sns](#sns)
- [Transaction Modes](#transaction-modes)
- [Dependencies](#dependencies)
- [License](#license)

---

## Installation

```bash
npm install solotto
```

---

## Quick Start

```js
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { LotteryManager, Lottery } from "solotto";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const programId = new PublicKey("YOUR_PROGRAM_ID");

// --- Authority creates a lottery ---
const authority = Keypair.generate(); // or load from file/wallet

const manager = new LotteryManager(connection, programId);
const result = await manager.Initialize(authority, 100000000, 1);
// Creates lottery #1 with a ticket price of 0.1 SOL (in lamports)
console.log(result); // "finalized"
```

---

## Architecture

Solotto is organized into three exported classes, each handling a different layer of responsibility:

| Class | Role |
|---|---|
| **`LotteryManager`** | Admin operations — initialize lotteries, trigger draws, lock/unlock ticket sales, reclaim expired prizes. |
| **`Lottery`** | Player & read operations — buy tickets, claim prizes, boost prize pools, query lottery/ticket/booster state, watch draws via WebSocket. |
| **`LotteryNetwork`** | Low-level transaction utilities — build, simulate, send, and confirm transactions with automatic compute budget and priority fee estimation. Also provides SNS domain resolution. |

---

## Classes

### LotteryManager

Used by the **lottery authority** (admin) to manage lotteries.

```js
import { LotteryManager } from "solotto";

const manager = new LotteryManager(connection, programId);
```

**Constructor Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `connection` | `Connection` | A `@solana/web3.js` Connection instance. |
| `program` | `PublicKey` | The Solotto on-chain program ID. |

---

### Lottery

Used by **players** to buy tickets and claim prizes, and by anyone to read lottery state. Extends `EventEmitter` to provide real-time draw notifications via `WatchDraw()`.

```js
import { Lottery } from "solotto";

const lottery = new Lottery(connection, "wss://your-rpc.com", programId);
```

**Constructor Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `connection` | `Connection` | — | A `@solana/web3.js` Connection instance. |
| `wss` | `String \| false` | `false` | WebSocket URL for real-time draw monitoring. Only required if using `WatchDraw()`. |
| `program` | `PublicKey` | — | The Solotto on-chain program ID. |

---

### LotteryNetwork

Low-level transaction builder and sender. Used internally by `LotteryManager` and `Lottery`, but can also be used directly for custom transaction flows.

```js
import { LotteryNetwork } from "solotto";

const network = new LotteryNetwork(connection);
```

**Constructor Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `connection` | `Connection` | A `@solana/web3.js` Connection instance. |

---

## API Reference

### LotteryManager API

#### Initialize

Creates a new on-chain lottery.

```js
const result = await manager.Initialize(authority, ticketPrice, lotteryId, encoded);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `Keypair` | — | The keypair that will own and control the lottery. |
| `ticketPrice` | `Number` | — | Price per ticket in **lamports** (1 SOL = 1,000,000,000 lamports). |
| `lotteryId` | `String` | — | A unique numeric identifier for this lottery. |
| `encoded` | `Boolean` | `false` | If `true`, returns a base64-encoded transaction instead of signing and sending. |

**Returns:** `"finalized"` on success when `encoded` is `false`, or a transaction object when `encoded` is `true`.

---

#### RandomDraw

Triggers the on-chain random draw to select a winning ticket. Only callable by the lottery authority.

```js
const result = await manager.RandomDraw(authority, lotteryId, encoded);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `Keypair` | — | The lottery authority keypair. |
| `lotteryId` | `String` | — | The lottery ID to draw. |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** When `encoded` is `false` and the transaction finalizes, returns the updated lottery state object (see [GetLottery](#getlottery)). Otherwise returns the transaction object.

---

#### LockLottery

Locks or unlocks ticket sales for a lottery. Only callable by the lottery authority.

```js
// Lock ticket sales
await manager.LockLottery(authority, lotteryId, 0);

// Unlock ticket sales
await manager.LockLottery(authority, lotteryId, 1);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `Keypair` | — | The lottery authority keypair. |
| `lotteryId` | `String` | — | The lottery ID. |
| `lockState` | `Number` | — | `0` to lock (stop sales), `1` to unlock (resume sales). |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** Updated lottery state object on finalization, or the transaction object when encoded.

---

#### ClaimExpired

Reclaims the prize pool funds from an expired lottery where the winner did not claim in time. Only callable by the lottery authority.

```js
const result = await manager.ClaimExpired(authority, lotteryId, encoded);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `Keypair` | — | The lottery authority keypair. |
| `lotteryId` | `String` | — | The lottery ID. |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** Updated lottery state object on finalization, `"Prize has already been claimed"` if the prize was already claimed, or the transaction object when encoded.

---

### Lottery API

#### BuyTickets

Purchases one or more tickets for a lottery. Supports buying up to 4 tickets in a single transaction.

```js
const lottery = new Lottery(connection, false, programId);

const result = await lottery.BuyTickets(buyer, authority, lotteryId, amount, encoded);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `buyer` | `Keypair` | — | The keypair of the ticket buyer. |
| `authority` | `Keypair \| {publicKey}` | — | The lottery authority (only `publicKey` is needed). |
| `lotteryId` | `Number` | — | The lottery ID to buy tickets for. |
| `amount` | `Number` | `1` | Number of tickets to purchase (1–4). |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** `"finalized"` on success, `"Lottery is not active, no tickets can be sold"` if the lottery is inactive, or the transaction object when encoded.

**Example:**

```js
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Lottery } from "solotto";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const programId = new PublicKey("YOUR_PROGRAM_ID");
const lottery = new Lottery(connection, false, programId);

const buyer = Keypair.generate();
const authority = { publicKey: new PublicKey("LOTTERY_AUTHORITY_PUBKEY") };

// Buy 2 tickets for lottery #1
const result = await lottery.BuyTickets(buyer, authority, 1, 2);
console.log(result); // "finalized"
```

---

#### ClaimTicket

Claims the prize for the winning ticket. Must be called by the ticket owner.

```js
const result = await lottery.ClaimTicket(authority, lotteryId, winner, encoded);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey}` | — | The lottery authority (only `publicKey` is needed). |
| `lotteryId` | `Number` | — | The lottery ID. |
| `winner` | `Keypair` | — | The keypair of the winning ticket's owner. |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** `"finalized"` on success, the simulation log array (`string[]`) if the transaction fails simulation, or the transaction object when encoded.

---

#### Boost

Boosts a lottery's prize pool by transferring SOL from any wallet. Can be called by anyone, not just the authority. Optionally attaches a memo message to the transaction.

```js
// Boost lottery #1 with 0.5 SOL
const result = await lottery.Boost(authority, lotteryId, booster, 0.5);

// Boost with a memo message
const result = await lottery.Boost(authority, lotteryId, booster, 1.0, "Good luck everyone!");
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey}` | — | The lottery authority (only `publicKey` is needed). |
| `lotteryId` | `String` | — | The lottery ID. |
| `booster` | `Keypair` | — | The keypair of the wallet sending the boost. |
| `amount` | `Number` | — | Amount of SOL to boost (e.g. `0.5` for 0.5 SOL). |
| `message` | `String \| false` | `false` | Optional memo string attached to the transaction. |
| `encoded` | `Boolean` | `false` | If `true`, returns encoded transaction. |

**Returns:** `"boosted"` on success, `"Draw initiated, cannot boost this prize pool"` if the draw has already started, or the transaction object when encoded.

> **Note:** When a `message` is provided, the SDK prepends `:booster:` to the memo string. This tag is used by `GetBoosters` to identify boost transactions when scanning on-chain history.

---

#### GetBoosters

Retrieves boost history by scanning on-chain program logs for boost transactions. Filters out errored and non-finalized transactions. Can filter by authority, lottery ID, or both, and optionally group results by booster wallet address.

```js
// Get all boosters for a specific lottery
const boosters = await lottery.GetBoosters(authority, lotteryId);

// Get all boosters across all lotteries (up to 500 transactions)
const allBoosters = await lottery.GetBoosters(false, false, false, 500);

// Get boosters grouped by wallet address
const grouped = await lottery.GetBoosters(authority, lotteryId, true);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey} \| false` | `false` | Filter by lottery authority. Pass `false` to include all authorities. |
| `lotteryId` | `Number \| false` | `false` | Filter by lottery ID. Pass `false` to include all lotteries. |
| `group` | `Boolean` | `false` | If `true`, groups results by booster wallet address. |
| `limit` | `Number` | `1000` | Maximum number of recent transactions to scan (max 1000). |

**Returns (ungrouped):** An array of booster objects:

```js
[
  {
    booster: "Pubkey...",       // Booster wallet public key
    lotteryId: 1,               // Lottery ID
    authority: "Pubkey...",     // Lottery authority public key
    amount: 0.5,                // Boost amount in SOL
    message: "Good luck!",     // Optional memo message (empty string if none)
    time: 1700000000,          // Unix block timestamp of the boost transaction
    signature: "TxSignature...",
  },
  // ...
]
```

**Returns (grouped, `group = true`):** An object keyed by booster wallet address:

```js
{
  "BoosterPubkey...": {
    boost: [
      { booster: "Pubkey...", lotteryId: 1, authority: "Pubkey...", amount: 0.5, message: "...", time: 1700000000, signature: "TxSig..." },
      // ...
    ],
    total: 1.5,    // Sum of all boost amounts in SOL
    count: 3,      // Number of boosts
  },
  // ...
}
```

---

#### GetMessages

Retrieves boost memo messages from on-chain transaction history. Paginates through program signatures and extracts messages from transactions tagged with `:booster:`. Useful for displaying a feed of booster shoutouts.

```js
// Get the latest boost messages (up to 1000)
const messages = await lottery.GetMessages();

// Get up to 200 messages
const recent = await lottery.GetMessages(200);

// Paginate: get messages until a specific signature
const older = await lottery.GetMessages(1000, "LastKnownSignature...");
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | `Number` | `1000` | Maximum number of transactions to scan. Paginates automatically if needed. |
| `until` | `String \| null` | `null` | Stop scanning at this transaction signature (exclusive). Useful for pagination. |

**Returns:** An array of message objects:

```js
[
  {
    message: "Good luck everyone!",   // The booster's memo text
    time: 1700000000,                  // Unix block timestamp
    signature: "TxSignature...",       // Transaction signature
  },
  // ...
]
```

---

#### GetLottery

Fetches the full on-chain state of a lottery.

```js
const state = await lottery.GetLottery(authority, lotteryId, fees);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey}` | — | The lottery authority (only `publicKey` is needed). |
| `lotteryId` | `Number` | — | The lottery ID. |
| `fees` | `Boolean` | `true` | If `true`, `prizePoolBalance` reflects the pool minus the 10% protocol fee. Set to `false` for the raw balance. |

**Returns:**

```js
{
  authority: "Pubkey...",         // Lottery authority public key
  lotteryId: 1,                  // Lottery ID
  ticketPrice: 100000000,        // Ticket price in lamports
  totalTickets: 42,              // Total tickets sold
  winnerTicketNumber: 17,        // Winning ticket number (0/null if not drawn)
  winnerAddress: "Pubkey...",    // Winner's public key as string (null if not drawn)
  isActive: true,                // Whether the lottery is active
  prizePoolBalance: 3780000000,  // Prize pool in lamports (after fees if fees=true)
  drawInitiated: false,          // Whether a draw has been initiated
  prizePoolAddress: "Pubkey...", // Per-lottery prize pool PDA (seeds: ["prize-pool", lotteryPDA])
  lotteryAddress: "Pubkey...",   // Lottery PDA
  release: "Pubkey...",          // Release address (lottery PDA)
  releaseTime: null,             // Unix timestamp when unclaimed prizes can be released (null if not set)
}
```

---

#### GetLotteries

Fetches all lottery accounts from the program, optionally filtered by authority. Returns an array of lottery state objects sorted descending by lottery ID.

```js
// Get all lotteries across all authorities
const allLotteries = await lottery.GetLotteries();

// Get all lotteries for a specific authority
const myLotteries = await lottery.GetLotteries(authority);

// Get all lotteries with raw prize pool (no fee deduction)
const raw = await lottery.GetLotteries(authority, false);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey} \| false` | `false` | Filter by lottery authority. Pass `false` to include all authorities. |
| `fees` | `Boolean` | `true` | If `true`, `prizePoolBalance` reflects a 10% fee deduction. |

**Returns:** An array of `LotteryState` objects (same shape as `GetLottery`), sorted descending by `lotteryId`.

---

#### GetTicket

Fetches a single ticket by its ticket number.

```js
const ticket = await lottery.GetTicket(authority, lotteryId, ticketNumber);
```

| Parameter | Type | Description |
|---|---|---|
| `authority` | `{publicKey}` | The lottery authority (only `publicKey` is needed). |
| `lotteryId` | `Number` | The lottery ID. |
| `ticketNumber` | `Number` | The ticket number to look up. |

**Returns:**

```js
{
  ticketOwner: "Pubkey...",     // Owner of the ticket
  ticketReceipt: "Pubkey...",   // Receipt account public key
  ticketNumber: 17,             // The ticket number
  ticketPda: "Pubkey...",       // Ticket PDA
  lotteryId: 1,                 // Lottery ID
  lotteryAddress: "Pubkey...",  // Lottery PDA
  lotteryAuth: "Pubkey...",     // Lottery authority
}
```

---

#### GetTickets

Fetches all tickets for a lottery, optionally filtered by buyer, grouped by owner, and/or enriched with purchase timestamps and transaction signatures.

```js
// Get all tickets
const allTickets = await lottery.GetTickets(authority, lotteryId);

// Get tickets for a specific buyer
const myTickets = await lottery.GetTickets(authority, lotteryId, buyer);

// Get all tickets grouped by owner
const grouped = await lottery.GetTickets(authority, lotteryId, false, true);

// Get all tickets with purchase timestamps
const withTime = await lottery.GetTickets(authority, lotteryId, false, false, true);

// Get all tickets with timestamps and signatures
const full = await lottery.GetTickets(authority, lotteryId, false, false, true, true);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `authority` | `{publicKey}` | — | The lottery authority. |
| `lotteryId` | `Number` | — | The lottery ID. |
| `buyer` | `{publicKey} \| false` | `false` | Optional buyer to filter by. |
| `group` | `Boolean` | `false` | If `true`, groups tickets by owner. |
| `time` | `Boolean` | `false` | If `true`, includes the block timestamp for each ticket. |
| `signature` | `Boolean` | `false` | If `true`, includes the transaction signature for each ticket. |

> **Note:** The `time` and `signature` options share a single RPC call per ticket, so enabling both does not double the number of requests.

**Returns (ungrouped):**

```js
{
  lotteryId: 1,
  lotteryAddress: "Pubkey...",
  lotteryAuth: "Pubkey...",
  buyer: "All",                // or the buyer's public key
  tickets: [
    {
      owner: "Pubkey...",
      lottery: "Pubkey...",
      ticketReceipt: "Pubkey...",
      ticketNumber: 42,
      ticketPda: "Pubkey...",
      time: null,              // Unix timestamp when time=true, null otherwise
      signature: "TxSig...",   // Present only when signature=true
    },
    // ... sorted descending by ticket number
  ],
}
```

**Returns (grouped, `group = true`):**

```js
{
  lotteryId: 1,
  lotteryAddress: "Pubkey...",
  lotteryAuth: "Pubkey...",
  buyer: "All",
  tickets: [
    {
      owner: "Pubkey...",
      ticketCount: 3,
      tickets: [
        { owner: "Pubkey...", lottery: "Pubkey...", ticketReceipt: "Pubkey...", ticketNumber: 42, ticketPda: "Pubkey...", time: null },
        // ...
      ],
    },
    // ... one entry per unique owner
  ],
}
```

---

#### WatchDraw

Opens a WebSocket subscription to listen for draw events in real time. Requires the `wss` parameter to be set in the `Lottery` constructor. Automatically reconnects on connection failure.

The `Lottery` class extends `EventEmitter`, so you subscribe to draw results and connection lifecycle events using standard `.on()` listeners.

```js
const lottery = new Lottery(connection, "wss://your-rpc.com", programId);

// Listen for draw results
lottery.on("draw", ({ winningTicketNumber, signature }) => {
  console.log(`Winning ticket: #${winningTicketNumber}`);
  console.log(`Transaction: ${signature}`);
});

// Connection lifecycle events (optional)
lottery.on("connected", () => {
  console.log("WebSocket connected");
});

lottery.on("error", (err) => {
  console.error("WebSocket error:", err);
});

lottery.on("reconnecting", ({ delay }) => {
  console.log(`Reconnecting in ${delay / 1000}s...`);
});

// Start watching
await lottery.WatchDraw();
```

**Emitted Events:**

| Event | Payload | Description |
|---|---|---|
| `draw` | `{ winningTicketNumber: Number, signature: String }` | Fired when a lottery draw is finalized on-chain. |
| `connected` | — | Fired when the WebSocket connection is established. |
| `error` | `Error` | Fired when the WebSocket encounters a connection error. |
| `reconnecting` | `{ delay: Number }` | Fired before an automatic reconnection attempt. `delay` is in milliseconds. |

---

### LotteryNetwork API

The `LotteryNetwork` class handles low-level transaction construction, simulation, and sending. It is used internally but can also be used directly.

#### Tx

Builds a versioned transaction with automatic compute budget optimization and priority fee estimation.

```js
const network = new LotteryNetwork(connection);

const result = await network.Tx({
  account: "PublicKeyString",   // (required) Payer public key as string
  instructions: [ix1, ix2],     // (required) Array of TransactionInstruction
  signers: false,               // Array of Keypairs to pre-sign, or false
  priority: "Low",              // "Low" | "Medium" | "High" | "VeryHigh" | "Extreme"
  tolerance: 1.1,               // Compute unit multiplier for safety margin
  serialize: false,             // If true, serializes the transaction
  encode: false,                // If true, base64-encodes the serialized transaction
  compute: true,                // If true, simulates and optimizes compute units
  fees: true,                   // If true, estimates and sets priority fees
  table: false,                 // Address Lookup Table account, or false
  memo: false,                  // Optional memo string, or false
});

// result.status  → "ok" | "error"
// result.message → "success" | error description
// result.transaction → VersionedTransaction (or serialized/encoded form)
```

---

#### Send

Sends a signed transaction to the network.

```js
const signature = await network.Send(signedTransaction);
```

**Returns:** A transaction signature string, or an error object `{ status: "error", message: ... }`.

---

#### Status

Polls for transaction confirmation until finalized or timeout.

```js
const status = await network.Status(signature, maxRetries, intervalSeconds);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `signature` | `String` | — | The transaction signature. |
| `maxRetries` | `Number` | `10` | Maximum number of polling attempts. |
| `intervalSeconds` | `Number` | `3` | Seconds between each poll. |

**Returns:** `"finalized"`, `"program error!"`, or a timeout message string.

---

#### Sns

Resolves a Solana wallet address to its primary `.sol` domain name using the [Bonfida SNS](https://sns.id/) (Solana Name Service). Returns the domain if found, or the original wallet address as a fallback.

```js
const name = await network.Sns("YourWalletPubkey...");
// → "alice.sol" or "YourWalletPubkey..." if no domain is set
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `wallet` | `String` | — | The wallet public key as a base-58 string. |

**Returns:** The primary `.sol` domain (e.g. `"alice.sol"`), or the original wallet address string if no domain is found or an error occurs.

---

## Transaction Modes

Every write method (`Initialize`, `RandomDraw`, `LockLottery`, `ClaimExpired`, `Boost`, `BuyTickets`, `ClaimTicket`) supports two modes controlled by the `encoded` parameter:

**Direct Mode** (`encoded = false`, default) — The SDK signs, sends, and confirms the transaction. Requires the keypair to have a `secretKey`. Returns the final status or lottery state.

```js
const result = await manager.Initialize(authority, 100000000, 1);
// result → "finalized"
```

**Encoded Mode** (`encoded = true`) — The SDK builds the transaction and returns it as a base64-encoded string. Useful for wallet adapters or server-side signing flows where the private key is not directly available.

```js
const result = await manager.Initialize(authority, 100000000, 1, true);
// result.transaction → base64-encoded transaction string
// Sign and send with your wallet adapter
```

---

## Dependencies

- `@solana/web3.js` — Solana JavaScript SDK
- `@solana/spl-memo` — Memo program instruction helper
- `@solana/kit` — WebSocket subscriptions (for `WatchDraw`)
- `@bonfida/spl-name-service` — Solana Name Service domain resolution (for `Sns`)
- `bn.js` — Big number library
- `bs58` — Base58 encoding/decoding
- `buffer-layout` — Buffer struct layout parsing

---

## License

See [LICENSE](./LICENSE) for details.