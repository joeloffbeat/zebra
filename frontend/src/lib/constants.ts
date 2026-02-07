// Deployed contract addresses (Sui mainnet — update after redeployment)
export const DARK_POOL_PACKAGE = 'TODO_MAINNET_DARK_POOL_PACKAGE';
export const DARK_POOL_OBJECT = 'TODO_MAINNET_DARK_POOL_OBJECT';
export const SEAL_PACKAGE_ID = '0xcb83a248bda5f7a0a431e6bf9e96d184e604130ec5218696e3f1211113b447b7';
export const SEAL_ALLOWLIST_ID = 'TODO_MAINNET_SEAL_ALLOWLIST_ID';
export const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3006';

// LiFi cross-chain bridging constants
export const LIFI_CHAIN_IDS = {
  ARBITRUM: 42161,
  SUI: 9270000000000000,
  ETHEREUM: 1,
  BASE: 8453,
  OPTIMISM: 10,
  POLYGON: 137,
} as const;

export const ARB_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const SUI_USDC_ADDRESS = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
