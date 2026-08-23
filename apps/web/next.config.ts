import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@outcome/config', '@outcome/schema'],
}

export default config
