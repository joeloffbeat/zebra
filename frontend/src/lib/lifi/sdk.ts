import { createConfig, EVM } from '@lifi/sdk';
import type { WalletClient } from 'viem';

let initialized = false;
let evmProvider: ReturnType<typeof EVM> | null = null;

export function initLiFi() {
  if (initialized) return;

  evmProvider = EVM();

  createConfig({
    integrator: 'zebra-dark-pool',
    providers: [evmProvider],
  });

  initialized = true;
}

export function setLiFiWalletClient(walletClient: WalletClient) {
  if (evmProvider) {
    evmProvider.setOptions({
      getWalletClient: () => Promise.resolve(walletClient as never),
    });
  }
}
