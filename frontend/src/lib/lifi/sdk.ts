import { createConfig, EVM } from '@lifi/sdk';

let initialized = false;

export function initLiFi() {
  if (initialized) return;

  createConfig({
    integrator: 'zebra-dark-pool',
    providers: [EVM()],
  });

  initialized = true;
}
