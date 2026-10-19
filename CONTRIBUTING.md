# Contributing to Linkora

Thanks for helping build Linkora — a decentralised social network on Stellar and Soroban.

## Prerequisites

- **Node.js 20** (see `.node-version`; CI and `setup.sh` read the same file)
- **pnpm 9.15.9** (`corepack enable` is the easiest way to get the pinned version)
- **Rust** with the `wasm32-unknown-unknown` target, plus `rustfmt` and `clippy`
  (only needed for `packages/contracts`)

## Getting started

```bash
pnpm install              # installs every workspace package
pnpm --filter apps-web dev  # web app on http://localhost:3000
```

Copy the example env file if one exists in the package you are working on and fill in the
values you need. Nothing is required to run the test suites.

## Repository layout

| Path                 | What lives there                                            |
| -------------------- | ----------------------------------------------------------- |
| `apps/web`           | Next.js 15 / React 19 front end                             |
| `apps/mobile`        | React Native client                                         |
| `packages/contracts` | Soroban smart contracts (Rust)                              |
| `packages/sdk`       | TypeScript SDK + generated contract bindings                |
| `packages/types`     | Shared types, schemas and errors                            |
| `services/*`         | Indexer, relay, analytics-oracle and other backend services |

## Checks

Run these before opening a pull request — they are the same commands CI runs.

```bash
pnpm typecheck        # tsc --noEmit across every package
pnpm test             # unit tests
pnpm lint             # eslint (and next lint for the web app)
pnpm check:bundle     # bundle-size budget for the web app
pnpm build            # production builds

# smart contracts only
cd packages/contracts
cargo fmt --check                     # formatting (rustfmt.toml: max_width = 100)
cargo clippy --all-targets -- -D warnings
cargo test
```

The web app additionally has Playwright end-to-end tests, which run in CI whenever a pull
request touches `apps/web/**`:

```bash
pnpm --filter apps-web test:e2e
```

### Golden rule for CI

Never edit `pnpm-lock.yaml` by hand. Run `pnpm install` after changing a
`package.json` and commit the regenerated lockfile — CI installs with
`--frozen-lockfile` and fails loudly when the two drift apart.

## Commit and pull request conventions

- Keep commits focused; one logical change per commit.
- Write imperative commit subjects (`fix(feed): stream posts with use()`).
- Reference the issue you are closing (`Closes #123`) in the pull request body.
- Add or update tests for behaviour changes; a bug fix without a regression test is
  usually sent back.
- Keep the diff small: avoid drive-by refactors in unrelated files.

## Third-party scripts

Scripts loaded from other origins are the single biggest source of main-thread jank and
of privacy surprises, so they follow a strict policy.

### Load third-party code through `next/script`

Never add a bare `<script src="…">` tag. Use the component in
`apps/web/src/components/ThirdPartyScripts.tsx`, which pins every script to the lowest
priority it can get away with:

| Priority            | Use it for                                              | Why                                                            |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `beforeInteractive` | Wallet SDK — the app is unusable until it exists        | Hoisted into `<head>`, fetched before hydration                |
| `afterInteractive`  | Analytics, chat widgets                                 | Loaded once the page is usable; never blocks first paint        |
| `lazyOnload`        | IPFS pinning, web-vitals beacons, "nice to have" embeds | Idle-time only; never competes with app code for bandwidth      |

Existing cases: wallet SDK → `beforeInteractive`, analytics → `afterInteractive`,
IPFS/vitals helpers → `lazyOnload`. The inline theme bootstrap in `app/layout.tsx` is
intentionally **not** a third-party script: it is inlined precisely so it cannot add a
network round-trip before first paint.

### Keep scripts opt-in

Each script is gated behind a `NEXT_PUBLIC_*` URL:

| Env var                            | Priority            |
| ---------------------------------- | ------------------- |
| `NEXT_PUBLIC_WALLET_SDK_URL`       | `beforeInteractive` |
| `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` | `afterInteractive`  |
| `NEXT_PUBLIC_IPFS_SCRIPT_URL`      | `lazyOnload`        |

Self-hosted deployments must never be forced to call a vendor they did not configure, so
an unset variable means "do not load this script at all".

### Ship connection hints with the scripts

Origins the app is guaranteed to talk to are warmed up in `app/layout.tsx` with
`<link rel="preconnect">` (and `dns-prefetch` as a fallback). Add a hint whenever you add
a new first-party origin that is hit on most page loads — TLS and DNS setup are the
expensive parts of the first RPC call. Keep the list short: hinting too many origins makes
every hint less effective.

### Checklist for a new third-party script

1. Is it really necessary? Prefer a first-party implementation or a server-side call.
2. Give it the lowest priority that still works (`lazyOnload` > `afterInteractive` >
   `beforeInteractive`).
3. Gate it behind a `NEXT_PUBLIC_*` env var and document the variable.
4. Add the origin to the preconnect list if it is on the critical path.
5. Note the change in the pull request so reviewers can weigh the performance cost.
