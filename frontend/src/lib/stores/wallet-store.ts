import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  evmAddress: string | null;
  balance: {
    sui: string;
    usdc: string;
  };

  setAddress: (address: string | null) => void;
  setConnected: (connected: boolean) => void;
  setEvmAddress: (address: string | null) => void;
  setBalance: (balance: { sui: string; usdc: string }) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      isConnected: false,
      evmAddress: null,
      balance: { sui: '0', usdc: '0' },

      setAddress: (address) => set({ address }),
      setConnected: (isConnected) => set({ isConnected }),
      setEvmAddress: (evmAddress) => set({ evmAddress }),
      setBalance: (balance) => set({ balance }),
      disconnect: () => set({
        address: null,
        isConnected: false,
        evmAddress: null,
        balance: { sui: '0', usdc: '0' }
      }),
    }),
    {
      name: 'zebra-wallet',
    }
  )
);
