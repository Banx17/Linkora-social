import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Remote hosts the image optimizer may fetch from (#1748). Mirrors
 * `getOptimizableImageHosts()` in src/lib/responsiveImage.ts: the indexer
 * (which serves uploaded media) plus any `NEXT_PUBLIC_IMAGE_HOSTS` entries.
 * Images from other hosts are rendered `unoptimized` instead.
 */
function imageRemotePatterns() {
  const patterns = [];
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_API_URL;
  if (indexerUrl) {
    try {
      const { protocol, hostname, port } = new URL(indexerUrl);
      patterns.push({ protocol: protocol.replace(':', ''), hostname, port });
    } catch {
      // Relative or malformed URL: nothing to allow.
    }
  }
  for (const host of (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '').split(',')) {
    const hostname = host.trim();
    if (hostname) patterns.push({ protocol: 'https', hostname });
  }
  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['linkora-sdk', '@linkora/types'],
  images: {
    remotePatterns: imageRemotePatterns(),
    // Default and Save-Data qualities (see src/lib/responsiveImage.ts).
    qualities: [40, 75],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    // Resolve linkora-sdk to its TypeScript source so Next.js can transpile it
    // directly instead of relying on a pre-built dist/ folder.
    config.resolve.alias['linkora-sdk'] = path.resolve(
      __dirname,
      '../../packages/sdk/src',
    );
    // The SDK source uses ESM `.js` specifiers (which become `.ts` files here).
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
