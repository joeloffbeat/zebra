import { createConfig, EVM } from '@lifi/sdk';
import {
  getWalletClient as getWagmiWalletClient,
  switchChain as wagmiSwitchChain,
} from '@wagmi/core';
import type { Config as WagmiConfig } from 'wagmi';

let initialized = false;

export function initLiFi(wagmiConfig: WagmiConfig) {
  if (initialized) return;

  const evmProvider = EVM({
    getWalletClient: async () => {
      const client = await getWagmiWalletClient(wagmiConfig);
      return client as never;
    },
    switchChain: async (chainId: number) => {
      await wagmiSwitchChain(wagmiConfig, { chainId });
      const client = await getWagmiWalletClient(wagmiConfig, { chainId });
      return client as never;
    },
  });

  createConfig({
    integrator: 'zebra-dark-pool',
    providers: [evmProvider],
  });

  initialized = true;
}
