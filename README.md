---
title: KriptoFani AI Crypto Trading Platform
emoji: ⚡
colorFrom: indigo
colorTo: purple
sdk: static
pinned: false
license: mit
---

# KriptoFani

Private two-account Binance Spot / USDT-M trading application with a Next.js dashboard, a persistent execution worker, recorded decisions and tenant-scoped fill accounting. Developed by [Imamverdi Behbudlu](https://behbudlu.com).

The current `risk-v2` strategy and execution system have local regression tests. Profitability, live exchange acceptance and 100-user execution latency have **not** been established. Read the [audit](codex_analiz_comments.md) and [remediation / migration runbook](docs/audit-remediation.md) before using an existing trading account.

## Architecture

- Next.js 16.2.6 / React 19 dashboard and authenticated job submission routes.
- One persistent worker per local SQLite database; atomic reservations, durable order intents, deterministic exchange client IDs, fill reconciliation and notification outbox.
- Dedicated exchange accounts only. Futures requires One-way, isolated margin and verified matching Spot account identity. Leverage is limited to 1–5.
- Futures native close-position stop remains on the exchange across partial exits. Local break-even/trailing requires a healthy worker. Spot uses OCO with a market-stop leg.
- Real fill quantities, commissions and funding drive reporting. Legacy history remains separate from verified PnL.
- Closed-candle trend/RSI inputs and an AI direction proposal; deterministic stop, sizing and risk limits. AI confidence is not a calibrated probability of profit.

The two-account deployment uses explicit user admission and independent account monitoring/analysis lanes. Follow the [two-account setup and acceptance runbook](docs/two-account-readiness.md); public registration is closed by default.

## Local setup

```bash
npm ci
cp .env.example .env
```

Set unique `JWT_SECRET`, `ENCRYPTION_KEY`, cron/webhook secrets and the required model credentials. Do not overwrite existing encryption keys when upgrading a database. Keep `TRADING_ENABLED=false` and `TRADING_ACCOUNT_IS_DEDICATED=false` during migration and acceptance testing.

```bash
npm test
npm run typecheck
npm run build -- --webpack
npm start
```

Web runs at `http://localhost:3005`. `npm start` supervises web, worker and watchdog. `npm run dev` also launches all three. Monitoring can close existing managed positions even when **new entries** are disabled. Use a separate `DB_PATH` and demo exchange credentials for testing; do not run a second worker against the same production account.

`/api/health` returns 503 when the worker heartbeat is missing/stale. Manual analysis returns a queued job; `/api/jobs` reports its status. Pausing the bot or subscription expiry prevents new entries without disabling existing exposure monitoring.

## Risk controls

- Capital/margin allocation: 0–20% per trade.
- Stop-distance plus estimated execution costs: 0–2% equity per trade, default 0.25%.
- Portfolio reserved stress risk: 2%; gross notional: at most equity.
- 2% daily equity loss or 5% drawdown freezes new entries.

These are entry and monitoring controls, not guarantees of maximum loss. Gaps, unavailable exchanges and unsupported cashflows can invalidate simple stop-loss assumptions. See the runbook for account topology and cashflow restrictions.

## Review and replay

```bash
npm run trading:review -- USER_ID inspect
npm run replay -- recorded-input.json replay-output.json
```

Review tooling does not create/cancel exchange orders. Mutating review actions for legacy archival, historical fee valuation and clearing freezes have explicit flat-account checks described in the runbook. Recorded-signal replay is not a historical model backtest or profitability proof.

## Validation and remaining scope

54 regression tests, TypeScript, an isolated production build and HTTP authorization smoke checks passed. Repository-wide lint now passes with zero errors/warnings. Crash/restart, WAL backup/restore, legacy migration, capital reconciliation and notification failure/retry are covered by offline acceptance tests. See [offline acceptance](docs/offline-acceptance.md). Live exchange/demo acceptance, production-account restore rehearsal, empirical strategy validation and distributed multi-tenant scale remain unverified or unimplemented; details are tracked in [audit-remediation.md](docs/audit-remediation.md).
