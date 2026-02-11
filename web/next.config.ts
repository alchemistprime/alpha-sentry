import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  typescript: {
    // Parent src code has its own tsconfig with different path aliases
    // Skip type checking here as it's checked separately
    ignoreBuildErrors: true,
  },
  eslint: {
    // Parent code has its own linting configuration
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['../src'],
  serverExternalPackages: [
    '@mastra/core',
    '@mastra/memory',
    '@mastra/libsql',
    'exa-js',
  ],
  webpack: (config) => {
    // Resolve @dexter alias to parent src directory
    config.resolve.alias = {
      ...config.resolve.alias,
      '@dexter': path.resolve(__dirname, '../src'),
      '@': path.resolve(__dirname, '../src'),
    };

    // Add parent node_modules to module resolution paths
    config.resolve.modules = [
      path.resolve(__dirname, '../node_modules'),
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ];

    // Handle .js extensions for TypeScript files (Bun-style imports)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    return config;
  },
};

export default nextConfig;
