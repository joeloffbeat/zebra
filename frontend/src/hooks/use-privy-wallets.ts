'use client';

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin, useLogout } from '@privy-io/react-auth';
import { useCreateWallet } from '@privy-io/react-auth/extended-chains';

export interface PrivyWalletEntry {
  chain: 'EVM' | 'SOL' | 'SUI' | 'BTC';
  address: string;
}

export function usePrivyWallets() {
  const { address: evmAddress } = useAccount();
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
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

  // Extract embedded wallet addresses from linkedAccounts
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
    embeddedWallets,
    isPrivyAuthenticated: authenticated,
    isPrivyReady: ready,
    loginWithPrivy: login,
    logoutPrivy: logout,
  };
}
