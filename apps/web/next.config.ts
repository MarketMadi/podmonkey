import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
};

export default nextConfig;
