import { http, createConfig } from 'wagmi';
import { arbitrum, base } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [arbitrum, base],
  transports: {
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
});
