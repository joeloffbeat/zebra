'use client';

import { useAccount } from 'wagmi';
import { usePrivy, useLogin, useLogout } from '@privy-io/react-auth';

export function useEvmWallet() {
  const { address, isConnected, chain } = useAccount();
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();

  return {
    evmAddress: address ?? null,
    isEvmConnected: isConnected,
    evmChain: chain,
    isPrivyReady: ready,
    isPrivyAuthenticated: authenticated,
    loginWithPrivy: login,
    logoutPrivy: logout,
  };
}
