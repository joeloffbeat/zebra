import { createConfig, EVM, Sui } from '@lifi/sdk';
import type { SuiProvider } from '@lifi/sdk';
import {
  getWalletClient as getWagmiWalletClient,
  switchChain as wagmiSwitchChain,
} from '@wagmi/core';
import type { Config as WagmiConfig } from 'wagmi';
import type { WalletWithRequiredFeatures } from '@mysten/wallet-standard';

let initialized = false;
let suiProvider: SuiProvider | null = null;

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

  suiProvider = Sui();

  createConfig({
    integrator: 'zebra-dark-pool',
    providers: [evmProvider, suiProvider],
  });

  initialized = true;
}

export function setLiFiSuiWallet(wallet: WalletWithRequiredFeatures) {
  if (suiProvider) {
    suiProvider.setOptions({
      getWallet: () => Promise.resolve(wallet as never),
    });
  }
}
