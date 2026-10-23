# Feature Flags

Edge Config-backed feature flags for instant A/B testing without server round-trips.

---

## Overview

Linkora's feature flag system uses **Vercel Edge Config** as the primary data source, enabling sub-millisecond reads at the edge. Flags are consumed via:

- **Server components / API routes:** `getFlag(key)`
- **Client components:** `useFeatureFlag(key)` React hook

Both functions fall back gracefully to environment variables and then hard-coded defaults when Edge Config is unavailable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel Edge Config                                             │
│  (key-value store, globally replicated, <1 ms reads)            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Server: getFlag(key)                                            │
│  1. Try Edge Config  2. Try FEATURE_FLAG_<KEY> env var           │
│  3. Fall back to FLAG_DEFAULTS                                   │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  GET /api/flags/[key]  (edge runtime)                            │
│  Cache-Control: s-maxage=60, stale-while-revalidate=60          │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Client: useFeatureFlag(key)                                     │
│  - Hydrates immediately with FLAG_DEFAULTS (no flash)            │
│  - Fetches server value asynchronously                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Usage

### Server-side (App Router, API routes, Server Actions)

```ts
import { getFlag } from '@/lib/featureFlags';

export default async function Page() {
  const darkModeEnabled = await getFlag('dark-mode-toggle');
  
  return <div>{darkModeEnabled ? 'Dark mode available' : 'Light mode only'}</div>;
}
```

### Client-side (React components)

```tsx
'use client';
import { useFeatureFlag } from '@/lib/featureFlags';

export function MyComponent() {
  const infiniteScrollEnabled = useFeatureFlag('infinite-scroll');
  
  return <div>{infiniteScrollEnabled ? 'Scroll to load more' : 'View all'}</div>;
}
```

---

## Available Flags

| Key | Default | Description |
|-----|---------|-------------|
| `dark-mode-toggle` | `true` | Show/hide the dark mode toggle in NavBar and Settings |
| `infinite-scroll` | `true` | Use IntersectionObserver pagination in FeedContainer (10 posts/page) |
| `command-palette` | `true` | Attach global keyboard shortcuts (`n`, `/`, `?`, `g+f`, etc.) |

---

## Adding a New Flag

1. **Update the type union:**

   ```ts
   // apps/web/src/lib/featureFlags.ts
   export type FeatureFlagKey =
     | "dark-mode-toggle"
     | "infinite-scroll"
     | "command-palette"
     | "your-new-flag";  // ← add here
   ```

2. **Add a default value:**

   ```ts
   export const FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
     // ...
     "your-new-flag": true,
   };
   ```

3. **Use the flag in your component:**

   ```tsx
   const myFeatureEnabled = useFeatureFlag('your-new-flag');
   ```

4. **(Optional) Set in `.env.local` for local overrides:**

   ```env
   FEATURE_FLAG_YOUR_NEW_FLAG=false
   ```

5. **(Optional) Push to Edge Config for production:**

   Use the `updateFlag` server action (see [Admin API](#admin-api) below).

---

## Environment Variables

### Required in production (when using Edge Config)

| Variable | Purpose | Example |
|----------|---------|---------|
| `EDGE_CONFIG` | Vercel Edge Config connection string | `https://edge-config.vercel.com/ecfg_xxxxx?token=yyyyy` |
| `EDGE_CONFIG_ID` | Store ID (for admin writes) | `ecfg_abc123def456` |
| `VERCEL_API_TOKEN` | Vercel personal access token with write scope | `XYZ...` |
| `FLAGS_ADMIN_SECRET` | Shared secret guarding the update action | `your-secret-here` |

### Optional per-flag overrides

```env
# Set a flag locally without touching Edge Config
FEATURE_FLAG_DARK_MODE_TOGGLE=false
FEATURE_FLAG_INFINITE_SCROLL=true
FEATURE_FLAG_COMMAND_PALETTE=false
```

Key format: `FEATURE_FLAG_<KEY>` where `<KEY>` is uppercased with hyphens replaced by underscores.

---

## Admin API

### Updating Flags (Server Action)

```ts
// apps/web/src/app/actions/flags.ts
import { updateFlag } from '@/app/actions/flags';

const result = await updateFlag({
  key: 'dark-mode-toggle',
  enabled: false,
  adminSecret: process.env.FLAGS_ADMIN_SECRET!,
});

console.log(result);
// { success: true, message: "Flag 'dark-mode-toggle' set to false." }
```

**Requirements:**

- `FLAGS_ADMIN_SECRET` must match the value set in the server environment
- `EDGE_CONFIG_ID` and `VERCEL_API_TOKEN` must be configured
- The Vercel API token must have **write** access to the Edge Config store

**Security:**

The `adminSecret` parameter ensures the action cannot be called from the client without knowledge of the shared secret. Store `FLAGS_ADMIN_SECRET` in Vercel's environment variables (encrypted), **never commit it** to source control.

---

## Fallback Behavior

`getFlag(key)` and `useFeatureFlag(key)` resolve flags in this order:

1. **Vercel Edge Config** (if `EDGE_CONFIG` is set and the key exists)
2. **Environment variable** (`FEATURE_FLAG_<KEY>=true|false|1|0`)
3. **Hard-coded default** (`FLAG_DEFAULTS[key]`)

This ensures:

- **Local development works out-of-the-box** (defaults)
- **Staging can override via env vars** without touching production Edge Config
- **Production gets <1 ms reads** from the globally replicated Edge Config store
- **Zero downtime** if Edge Config is temporarily unavailable (falls back instantly)

---

## Testing

Unit tests live in `apps/web/src/lib/__tests__/featureFlags.test.ts`.

Run them:

```bash
cd apps/web
pnpm test src/lib/__tests__/featureFlags.test.ts
```

Coverage:

- `getFlag()` resolution order (Edge Config → env var → default)
- Edge Config error handling (network failure, missing key)
- `useFeatureFlag()` hydration (immediate default, async fetch)
- Fetch error handling (non-OK response, network error)

---

## Migration Guide

### Example: Dark Mode Toggle

**Before:**

```tsx
// NavBar.tsx
const [theme, setTheme] = useState<ThemePreference>("light");

<button onClick={toggleTheme}>
  {theme === "light" ? <MoonIcon /> : <SunIcon />}
</button>
```

**After:**

```tsx
// NavBar.tsx
const darkModeEnabled = useFeatureFlag("dark-mode-toggle");

{darkModeEnabled && (
  <button onClick={toggleTheme}>
    {theme === "light" ? <MoonIcon /> : <SunIcon />}
  </button>
)}
```

Now the button is hidden when `dark-mode-toggle` is set to `false` in Edge Config, without redeploying.

---

## Monitoring

Edge Config usage and performance metrics are available in the [Vercel Dashboard](https://vercel.com/dashboard) under **Storage → Edge Config → [your-store]**.

Key metrics:

- **Read latency** (p50, p99) — should be <1 ms globally
- **Cache hit ratio** — at the CDN edge
- **Request volume** — per flag key

---

## Troubleshooting

### Flag not updating in production

1. Verify `EDGE_CONFIG` is set in Vercel environment variables
2. Check the Edge Config dashboard for the key/value
3. Wait up to 60 seconds for the CDN cache (`s-maxage=60`) to expire
4. Force a cache purge: redeploy or use Vercel's cache invalidation API

### Flag reads from env var instead of Edge Config

`getFlag()` tries Edge Config first. If it's reading from the env var:

- `EDGE_CONFIG` is not set, or
- The key is missing from the Edge Config store, or
- The `@vercel/edge-config` import is failing (check build logs)

### `updateFlag()` returns "unauthorized"

- Verify `FLAGS_ADMIN_SECRET` matches in both the client call and server environment
- Check that `FLAGS_ADMIN_SECRET` is set in Vercel's environment variables

### `updateFlag()` returns "Edge Config API error"

- Verify `EDGE_CONFIG_ID` and `VERCEL_API_TOKEN` are set
- Check that the Vercel API token has **write** scope (`team:write` or `account:read`)
- Confirm the token is not expired (regenerate in Vercel dashboard if needed)

---

## Best Practices

1. **Always provide a default:** Add a fallback in `FLAG_DEFAULTS` for every flag. Missing defaults will evaluate to `false`.

2. **Use boolean flags only:** The current system is optimized for `true`/`false`. For multi-variant tests, use multiple boolean flags (`variant-a`, `variant-b`).

3. **Avoid flag proliferation:** Flags are for temporary experiments and gradual rollouts. Once a feature is stable and shipped to 100% of users, **remove the flag** and the conditional code.

4. **Document the flag's purpose:** Add a row to the [Available Flags](#available-flags) table when you add a new flag.

5. **Test both states:** Write unit tests covering both `flag=true` and `flag=false` code paths.

6. **Never block server rendering:** `useFeatureFlag()` returns the default immediately. The async fetch updates the UI after hydration. This ensures zero layout shift.

---

## References

- [Vercel Edge Config Docs](https://vercel.com/docs/storage/edge-config)
- [Edge Config REST API](https://vercel.com/docs/storage/edge-config/edge-config-rest-api)
- [`@vercel/edge-config` NPM](https://www.npmjs.com/package/@vercel/edge-config)
- [Next.js Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes)
