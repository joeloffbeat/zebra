// Deployed contract addresses (Sui mainnet)
export const DARK_POOL_PACKAGE = '0xca85bfc10d129d5e4f7bcabeecd6a332568e75b23fa9a929c0b83fc8c7aee2b2';
export const DARK_POOL_OBJECT = '0x3f47d9eaa0e6a1a159bbdd1fdc8a8bcc46252c51ed7e0494d1e10341c2ba9e58';
export const SEAL_PACKAGE_ID = '0xcb83a248bda5f7a0a431e6bf9e96d184e604130ec5218696e3f1211113b447b7';
export const SEAL_ALLOWLIST_ID = '';
export const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3006';

// LiFi cross-chain bridging constants
export const LIFI_CHAIN_IDS = {
  ARBITRUM: 42161,
  SUI: 9270000000000000,
  BASE: 8453,
} as const;

export const ARB_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SUI_USDC_ADDRESS = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const NATIVE_SUI_ADDRESS = '0x2::sui::SUI';

export const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ETH_DECIMALS = 18;
export const USDC_DECIMALS = 6;

export const USDC_BY_CHAIN: Record<number, string> = {
  [LIFI_CHAIN_IDS.ARBITRUM]: ARB_USDC_ADDRESS,
  [LIFI_CHAIN_IDS.BASE]: BASE_USDC_ADDRESS,
};
