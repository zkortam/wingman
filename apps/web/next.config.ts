import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: [
    '@wingman/config',
    '@wingman/db',
    '@wingman/ingest',
    '@wingman/pipeline',
    '@wingman/schema',
  ],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }

    return webpackConfig
  },
}

export default config
