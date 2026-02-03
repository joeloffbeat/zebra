'use client';

import { useCurrentAccount, useCurrentWallet, useDisconnectWallet, useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { useSuiClient } from '@mysten/dapp-kit';
import { useCallback, useEffect } from 'react';
import { useWalletStore } from '@/lib/stores/wallet-store';

export function useWallet() {
  const currentAccount = useCurrentAccount();
  const { currentWallet, connectionStatus } = useCurrentWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: connect } = useConnectWallet();
  const wallets = useWallets();
  const client = useSuiClient();

  const { setAddress, setConnected, setBalance, disconnect: clearStore } = useWalletStore();

  // Sync wallet state to store
  useEffect(() => {
    if (currentAccount?.address) {
      setAddress(currentAccount.address);
      setConnected(true);

      // Fetch balance
      client.getBalance({ owner: currentAccount.address }).then((balance) => {
        setBalance({
          sui: (Number(balance.totalBalance) / 1e9).toFixed(4),
          usdc: '0', // TODO: Fetch USDC balance
        });
      });
    } else {
      setAddress(null);
      setConnected(false);
    }
  }, [currentAccount?.address, client, setAddress, setConnected, setBalance]);

  const handleConnect = useCallback((walletName: string) => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet) {
      connect({ wallet });
    }
  }, [wallets, connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    clearStore();
  }, [disconnect, clearStore]);

  return {
    address: currentAccount?.address ?? null,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    walletName: currentWallet?.name,
    availableWallets: wallets.map((w) => ({ name: w.name, icon: w.icon })),
    connect: handleConnect,
    disconnect: handleDisconnect,
  };
}
