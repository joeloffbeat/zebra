'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import {
  usePrivy,
  useLogin,
  useLogout,
  useWallets,
  useActiveWallet,
} from '@privy-io/react-auth';
import type { ConnectedWallet } from '@privy-io/react-auth';
import { useCreateWallet } from '@privy-io/react-auth/extended-chains';

export interface PrivyWalletEntry {
  chain: 'EVM' | 'SOL' | 'SUI' | 'BTC';
  address: string;
}

export interface EvmWalletEntry {
  address: string;
  label: string; // "EMBEDDED" or "METAMASK" etc.
  isEmbedded: boolean;
  wallet: ConnectedWallet;
}

export function usePrivyWallets() {
  const { address: evmAddress } = useAccount();
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const { setActiveWallet } = useActiveWallet();
  const { createWallet } = useCreateWallet();
  const hasAutoCreated = useRef(false);

  // Auto-create SUI and BTC wallets on first Privy login
  useEffect(() => {
    if (!ready || !authenticated || !user || hasAutoCreated.current) return;
    hasAutoCreated.current = true;

    const linked = user.linkedAccounts || [];

    const hasSui = linked.some(
      (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'sui',
    );
    const hasBtc = linked.some(
      (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'bitcoin-segwit',
    );

    if (!hasSui) {
      createWallet({ chainType: 'sui' }).catch((e) =>
        console.warn('[Privy] SUI wallet auto-create failed:', e),
      );
    }
    if (!hasBtc) {
      createWallet({ chainType: 'bitcoin-segwit' }).catch((e) =>
        console.warn('[Privy] BTC wallet auto-create failed:', e),
      );
    }
  }, [ready, authenticated, user, createWallet]);

  // Separate EVM wallets into embedded vs external (browser)
  const evmWallets: EvmWalletEntry[] = useMemo(() => {
    return wallets
      .filter((w) => w.type === 'ethereum')
      .map((w) => ({
        address: w.address,
        label:
          w.walletClientType === 'privy'
            ? 'EMBEDDED'
            : w.walletClientType.toUpperCase().replace(/_/g, ' '),
        isEmbedded: w.walletClientType === 'privy',
        wallet: w,
      }));
  }, [wallets]);

  // External (browser) EVM wallet address — first non-embedded EVM wallet
  const browserEvmAddress = useMemo(() => {
    const external = evmWallets.find((w) => !w.isEmbedded);
    return external?.address ?? null;
  }, [evmWallets]);

  // Embedded SUI address from linkedAccounts
  const embeddedSuiAddress = useMemo(() => {
    if (!user?.linkedAccounts) return null;
    for (const account of user.linkedAccounts) {
      if (account.type !== 'wallet') continue;
      const wallet = account as { chainType?: string; address?: string };
      if (wallet.chainType === 'sui' && wallet.address) return wallet.address;
    }
    return null;
  }, [user?.linkedAccounts]);

  // Switch the active EVM wallet (updates wagmi's useAccount automatically)
  const setActiveEvmWallet = useCallback(
    (wallet: ConnectedWallet) => {
      setActiveWallet(wallet);
    },
    [setActiveWallet],
  );

  // Extract embedded wallet addresses from linkedAccounts (for the dropdown)
  const embeddedWallets: PrivyWalletEntry[] = [];

  if (evmAddress) {
    embeddedWallets.push({ chain: 'EVM', address: evmAddress });
  }

  if (user?.linkedAccounts) {
    for (const account of user.linkedAccounts) {
      if (account.type !== 'wallet') continue;
      const wallet = account as { chainType?: string; address?: string };
      if (!wallet.address) continue;

      if (wallet.chainType === 'solana') {
        embeddedWallets.push({ chain: 'SOL', address: wallet.address });
      } else if (wallet.chainType === 'sui') {
        embeddedWallets.push({ chain: 'SUI', address: wallet.address });
      } else if (wallet.chainType === 'bitcoin-segwit') {
        embeddedWallets.push({ chain: 'BTC', address: wallet.address });
      }
    }
  }

  return {
    evmAddress: evmAddress ?? null,
    evmWallets,
    browserEvmAddress,
    embeddedSuiAddress,
    setActiveEvmWallet,
    embeddedWallets,
    isPrivyAuthenticated: authenticated,
    isPrivyReady: ready,
    loginWithPrivy: login,
    logoutPrivy: logout,
  };
}
