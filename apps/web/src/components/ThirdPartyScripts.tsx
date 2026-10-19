import Script from "next/script";

/**
 * Third-party script loading strategy (issue #1739).
 *
 * Every external script is loaded through `next/script` with an explicit
 * priority, and every script is opt-in via an env var so self-hosted
 * deployments never phone home to a vendor they did not configure:
 *
 * - `beforeInteractive` — wallet SDK: must exist before the user can interact.
 * - `afterInteractive` — analytics: useful once the page is usable.
 * - `lazyOnload` — IPFS pinning / vitals beacons: idle-time work only.
 *
 * See CONTRIBUTING.md → "Third-party scripts" for the rationale.
 */

const WALLET_SDK_URL = process.env.NEXT_PUBLIC_WALLET_SDK_URL;
const ANALYTICS_SCRIPT_URL = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL;
const IPFS_SCRIPT_URL = process.env.NEXT_PUBLIC_IPFS_SCRIPT_URL;

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://soroban-testnet.stellar.org";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const RPC_ORIGIN = toOrigin(RPC_URL);
const INDEXER_ORIGIN = toOrigin(INDEXER_URL);

/**
 * `preconnect` / `dns-prefetch` hints for the origins the app is guaranteed to
 * talk to. Hints are cheap and shave a full round-trip off the first RPC call.
 */
export function ResourceHints() {
  return (
    <>
      {RPC_ORIGIN && <link rel="preconnect" href={RPC_ORIGIN} crossOrigin="anonymous" />}
      {INDEXER_ORIGIN && <link rel="preconnect" href={INDEXER_ORIGIN} />}
      {RPC_ORIGIN && <link rel="dns-prefetch" href={RPC_ORIGIN} />}
      {INDEXER_ORIGIN && <link rel="dns-prefetch" href={INDEXER_ORIGIN} />}
    </>
  );
}

/** Opt-in third-party scripts, each pinned to the lowest priority it can use. */
export function ThirdPartyScripts() {
  return (
    <>
      {WALLET_SDK_URL && <Script src={WALLET_SDK_URL} strategy="beforeInteractive" />}
      {ANALYTICS_SCRIPT_URL && <Script src={ANALYTICS_SCRIPT_URL} strategy="afterInteractive" />}
      {IPFS_SCRIPT_URL && <Script src={IPFS_SCRIPT_URL} strategy="lazyOnload" />}
    </>
  );
}
