import type { NextConfig } from 'next';
import { join } from 'node:path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  ...(basePath ? { output: 'export' as const, basePath } : {}),
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  webpack: (config) => {
    config.module.rules.push({
      test: /\.ya?ml$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
