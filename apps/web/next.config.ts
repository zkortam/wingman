import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@wingman/config', '@wingman/schema'],
}

export default config
