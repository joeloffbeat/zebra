import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  balance: {
    sui: string;
    dbusdc: string;
  };

  setAddress: (address: string | null) => void;
  setConnected: (connected: boolean) => void;
  setBalance: (balance: { sui: string; dbusdc: string }) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      isConnected: false,
      balance: { sui: '0', dbusdc: '0' },

      setAddress: (address) => set({ address }),
      setConnected: (isConnected) => set({ isConnected }),
      setBalance: (balance) => set({ balance }),
      disconnect: () => set({
        address: null,
        isConnected: false,
        balance: { sui: '0', dbusdc: '0' }
      }),
    }),
    {
      name: 'zebra-wallet',
    }
  )
);
