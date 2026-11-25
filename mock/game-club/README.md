# Shared Game Club — local implementation / production contract

This directory is a **development-only, single-process mock backend**. It is excluded from `site-files.json`, as are tests and `local-private/`. No production backend, database, workflows or settings were changed. Do not expose this server outside loopback.

## Run and accounts

From the repository: `node mock/game-club/server.cjs` (Node 18+). Use the local key from `local-private/game-club/access-key.txt`. The club does not accept journal keys. Pass `--fixtures` explicitly to enable test account switching on loopback. LAN mode never enables fixture account switching. The server binds only `127.0.0.1:8790` and serves the allowlisted site and `/api/game-club/`.

- Shared page: `http://127.0.0.1:8790/club/`
- Classic: `http://127.0.0.1:8790/`
- New: `http://127.0.0.1:8790/v2/`
- Fixtures: `demo` / Светлана, `demo-two` / Максим, `demo-three` / Лена; optional fourth: `demo-four` / Илья.
- All fixture passwords: `club-demo`. These are intentionally public local test credentials, never real credentials. The mock creates users on first authenticated access and assigns a fixture age of eight days; this does **not** implement real registration or prove real account age.
- Each account may claim one free welcome grant of 200 Sparks, then daily free tickets and fictional prediction rewards. Existing local demo balances/inventory are preserved.

## Architecture and persistence

`club/index.html` loads `app.js`, `games.js`, `fairness.js`, and the shared existing v2 CSS plus club-only styles. Both More menus link to this one page. Journal authorization/state is separate. Classic app changes exactly one menu item; v2 app changes exactly one menu item. Existing journal/schedule/rendering logic and `v2/styles.css` are preserved. The new-mode shell additionally loads a small optional `club/appearance.js/css` bridge: only owned/equipped theme and weekly-table accents are read from the club session, without journal changes. Classic styling remains unchanged. Other cosmetics apply within the club.

`Engine` serializes access in one promise queue. Every command clones the current snapshot, validates the request, applies ledger changes, validates conservation/nonnegative invariants, and persists using fsync plus atomic rename before publishing the result. A write failure leaves both accounts, reservations, previews and idempotency receipts unchanged. The state file is `local-private/game-club/state.json`, ignored by Git and blocked by the static allowlist. This atomic snapshot is **not** a multi-process database transaction or an append-only tamper-resistant audit system.

An account has available `balance`, `reserved`, inventory, equipped IDs, grant/ticket/prediction state, history, and operation receipts. Every debit, credit and reservation change is a ledger entry with account, UUID, timestamp, available/reserve deltas and post-balances; transfer legs share a transfer ID, game legs share a round ID. Migration of the earlier mock balances records an opening snapshot rather than inventing past ledger entries. Ledger invariants are checked before disk commit. The UI exposes the last 100 ledger entries and 30 solo rounds; the server retains all entries/receipts.

The browser stores only a pending intent/body, account ID and idempotency key in sessionStorage. localStorage is used only for the existing UI-mode preference. Reload gets balance/inventory/rounds from the server. API responses are never cached by service workers. A lost session requires login again, retaining the pending request key. A confirmed replay returns the original receipt plus current server state.

## HTTP contract

All commands are JSON; unexpected top-level fields are rejected. POST requires `Idempotency-Key` (16–80 safe characters), JSON content type, same-origin checks, and the HttpOnly SameSite=Strict session cookie. `X-Club-Account` detects a session switched in another tab. The server also checks the exact loopback Host and rejects cross-site fetches. No client may supply balance, result, coefficient, catalogue price, owner or payout.

| Route | Request / response |
|---|---|
| POST session | `{account,password}` → authenticated state; fixture login only |
| POST logout | `{}` → revoke this session |
| GET state | state for cookie owner; reconnect heartbeat for existing rooms |
| GET recipients?q=... | ID/name matches only; no balances/inventory returned |
| POST command | strict intent below → `{receipt,state,replayed}` |

Command intents (all include `type`):

| Type | Fields |
|---|---|
| welcome, ticket, spin | none; one welcome grant, ticket interval, ticket spend respectively |
| buy, equip | itemId |
| unequip | category |
| predict | eventId, choice (0/1) |
| claim | eventId |
| transferPreview | recipientId, amount, optional comment |
| transfer | **previewId only**, never recipient/amount/comment |
| prepare | game: coin/numbers/multiplier/blackjack |
| start | roundId, amount, nonce, game-specific choice or numbers |
| act21 | roundId, action: hit/stand/double, version |
| cancelRound | roundId; an active reserve cannot be cancelled before expiry |
| roomCreate | none |
| roomJoin | code, personal amount, nonce |
| roomStart | code, version; owner only |
| roomAct | code, action: hit/stand, version; current participant only |
| roomLeave | code, version |

Errors use `{error:CODE}` with 400 invalid intent, 401 missing/changed session, 403 wrong owner/origin/host, 404 missing resource, 409 state/version/funds/limits conflict, 429 rate limit, 500 persistence/unexpected failure. Unknown/5xx replies retain the browser intent for exact-key retry. Keys are scoped to account and command fingerprint; a changed command with the same key conflicts.

Command limit: 30 new attempts/account/minute; replay remains available. Fixture login: 20/IP/minute. Reads: 120/session/minute. These in-memory limits and sessions reset on server restart; production must persist/coordinate them. Preview confirmation expires after five minutes and is consumable once. Transfers default enabled; `config.transfers.enabled=false` disables both preparation and execution. Defaults: max100/transfer, rolling200/24h and600/7d, both account ages≥24h. Comments≤140 characters with control-code validation and text-node rendering. Outgoing ledger entries enforce rolling limits across restarts. Self-transfers and insufficient funds are rejected; both ledger legs commit together. No item transfer, P2P catalogue, real settlement or exchange exists.

## Games, reserves and fairness

Amounts default2–100 in steps of2. Ratios are integer basis points, 10000=1×. A quoted **full return includes the original amount**. Integer payout is `floor(amount * ratio / 10000)`, net=`payout - amount`; the UI shows the selected amount, quote, reserve and final calculation. A losing round returns0. No cosmetics change odds.

| Game | Chances / full return |
|---|---|
| Coin | heads/tails50% each; match2×, miss0× |
| Numbers | 12 uniform sectors1–12; odd red/even white, 6 each. Color50%→2×. N unique selected numbers: N/12→12/N×. Coefficient first floors to4 decimal places, then integer payout floors. All12 numbers are allowed. |
| Multiplier | 0×20%, 0.5×20%, 1×30%, 1.5×15%, 2×10%, 5×5%; expected full return1.075× (107.5%) before integer rounding with these defaults. Visual sector sizes follow these weights. |
| 21 | 52 cards, no jokers, ace1/11, faces10, dealer stands on soft/hard17. Regular win2×, initial natural21=2.5×, push1×, loss0×. Both initial naturals push; initial dealer21 beats a non-natural. No split/insurance. Chances depend on the cards and decisions, not a fixed50/50. |
| Team21 | same card rules, 2–4 members and shared hand; ordered hit/stand decisions, no double. **Each personal contribution is reserved and settled separately**; no player-to-player pot or pooled winnings. |
| Free gift | ticket only, no balance debit; 50 Sparks70%,90 Sparks25%,120+badge5%; rare guaranteed by eighth attempt with rare weight renormalization shown before draw. |

Solo double is permitted on the first two cards if available balance covers the extra equal reserve and doubled amount≤100. It draws one card then stands. Player bust,21,dealer bust,push/dealer win/natural are separate outcomes. A per-round immutable rules snapshot governs ongoing settlement. The verifier reproduces the deck/actions and payout for newly recorded game rounds, alongside the cryptographic draw; older prototype card histories may lack the new action transcript.

Server `crypto.randomBytes(32)` creates a secret. `prepare` publishes SHA-256(secret), unique round ID and expiry **before** accepting amount/choice/client nonce. The stream is SHA256 of `secret:id:nonce:counter`, first uint32 big endian; values≥`floor(2^32/bound)*bound` are discarded to avoid modulo bias. Coin draws bound2, numbers12, multiplier10000; 21 uses Fisher-Yates shuffle of52 IDs. Draw/seed is never sent during active play; dealer hole card is hidden. On settlement, the secret, nonce, draw/deck prefix, choices and calculation data are disclosed. `club/fairness.js` reproduces the hash and draws using Web Crypto; tests inject deterministic secret/nonce and force a rejection-sampling boundary. Production should also bind/version the published rule snapshot and audit the issuance/reveal lifecycle. Secret storage is private mock JSON, **not** production encrypted secret storage.

Instant games reserve then settle within one command. Card reserves survive reload/server restart. Active solo decisions and room actions require the current version; terminal status and idempotency prevent a second settlement. A one-second maintenance timer closes expired rounds; the absolute lifetime is five minutes from preparation/room creation, and the UI states this. Expiry refunds each reserve once, including rooms with no online players.

Room codes are eight uppercase hex characters; invitations use `/club/?room=CODE`. A waiting room joins atomically, max4, each contribution once. Owner starts only when2–4 members all contributed. Polling `/state` every4seconds is the local realtime mock. Presence expires after20seconds; the turn deadline is30seconds, rotating among online contributors without taking an automatic game action. Reload/reopen reconnects membership; active leave preserves the reserve, while waiting leave refunds the leaver (owner cancels the room). An expired room refunds everyone. Polling pauses while editing forms/dialogs or a pending request exists.

## Production implementation contract — proposal only

Implement same-origin API routes beneath the deployed repository base path, or a reviewed configurable backend route. Replace fixture credentials/age with real authenticated account ID and server creation timestamp. Do not reuse the journal access key as a club identity. The public static build alone cannot provide authoritative game economics.

Recommended durable tables: accounts(available,reserved,version,status,created_at), ledger(entries with transaction/round IDs and post-balances), operations(unique account+key, canonical fingerprint, immutable receipt), transfer_previews(owner,recipient,amount,comment,expiry,consumed), rounds(secret protected,commitment,rules_version/rules_hash,status,version,expiry,transcript), room_members(personal contribution,nonce,presence), rooms(turn,deadline,version,status), inventory(unique owner+item), audit(actor,request/action/transaction IDs, outcome). Restrict direct client writes; all mutations go through authoritative server transactions.

For any transfer/game: begin transaction, lock accounts in stable ID order plus round/room/version row, lookup immutable idempotency operation, validate status/age/limits/owner/rules, update available/reserved and inventory, append balanced ledger entries, save receipt, commit; only then respond/broadcast. Keep nonnegative constraints and unique round settlement/inventory/operation keys. Persist rolling rate limits and audit failures without secrets or session credentials. Encrypt/protect unrevealed seeds; disclose only settled secrets. Run durable timeout/refund jobs using the same transaction and terminal-state guards. Realtime must authenticate memberships, broadcast only public room state, include monotonic versions and allow snapshot resync after gaps/reconnect. Bound archival/retention while preserving idempotency and ledger auditability. Enforce abuse suspensions on account/transfer paths. Real currency, payments, goods, compensated transfers, item markets and account sales remain forbidden.

## Validation

Run `npm test` (includes `node server.js --self-test`), `node scripts/build-site.cjs`, `node --check` on changed JS/CJS, `git diff --check`, and secret review. Tests cover transfers/limits/concurrency/rollback/replay, RNG/proofs, all solo21 terminal states/double/version conflicts, 3/4-player rooms/presence/turn/refund/restart, strict inputs, private ownership/session/XSS, cosmetics and preservation of both journal interfaces. Browser checks and exact results are recorded in the accompanying local report. No push, PR, merge or deploy is part of this implementation.
