import { createConfig, EVM } from '@lifi/sdk';
import { getWalletClient as getWagmiWalletClient } from '@wagmi/core';
import type { Config as WagmiConfig } from 'wagmi';

let initialized = false;

export function initLiFi(wagmiConfig: WagmiConfig) {
  if (initialized) return;

  const evmProvider = EVM({
    getWalletClient: () => getWagmiWalletClient(wagmiConfig) as never,
  });

  createConfig({
    integrator: 'zebra-dark-pool',
    providers: [evmProvider],
  });

  initialized = true;
}
