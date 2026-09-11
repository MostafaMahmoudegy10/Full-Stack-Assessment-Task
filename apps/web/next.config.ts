import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Configuration lives in a single .env file at the repository root.
loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  transpilePackages: ['@projectflow/shared'],
  ...(process.env.SINGLE_APP === 'true' ? { output: 'standalone' as const } : {}),
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.SINGLE_APP === 'true'
        ? '/api'
        : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4732'),
  },
  async rewrites() {
    return process.env.SINGLE_APP === 'true'
      ? [{ source: '/api/:path*', destination: 'http://127.0.0.1:4732/:path*' }]
      : [];
  },
};

export default nextConfig;
