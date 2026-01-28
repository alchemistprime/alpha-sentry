import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['../src'],
  serverExternalPackages: [
    '@langchain/core',
    '@langchain/openai',
    '@langchain/anthropic',
    '@langchain/google-genai',
    '@langchain/ollama',
    '@langchain/exa',
    '@langchain/tavily',
    'exa-js',
  ],
  webpack: (config) => {
    // Resolve @dexter alias to parent src directory
    config.resolve.alias = {
      ...config.resolve.alias,
      '@dexter': path.resolve(__dirname, '../src'),
      '@': path.resolve(__dirname, '../src'),
    };

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
