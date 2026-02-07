import { http, createConfig } from 'wagmi';
import { arbitrum, mainnet, base, optimism, polygon } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [arbitrum, mainnet, base, optimism, polygon],
  transports: {
    [arbitrum.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
});
