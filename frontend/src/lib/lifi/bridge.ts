import { getQuote, executeRoute, getStatus } from '@lifi/sdk';
import type { Route, StatusResponse } from '@lifi/sdk';
import { LIFI_CHAIN_IDS, ARB_USDC_ADDRESS, SUI_USDC_ADDRESS } from '../constants';

export interface BridgeQuote {
  route: Route;
  estimatedOutput: string;
  estimatedTime: number;
  gasCostUSD: string;
  steps: { tool: string; type: string }[];
}

export async function getQuoteArbToSui(
  fromAmount: string,
  fromAddress: string,
  toAddress: string,
): Promise<BridgeQuote> {
  const quote = await getQuote({
    fromChain: LIFI_CHAIN_IDS.ARBITRUM,
    toChain: LIFI_CHAIN_IDS.SUI,
    fromToken: ARB_USDC_ADDRESS,
    toToken: SUI_USDC_ADDRESS,
    fromAmount,
    fromAddress,
    toAddress,
  });

  return {
    route: quote,
    estimatedOutput: quote.estimate?.toAmount || '0',
    estimatedTime: quote.estimate?.executionDuration || 0,
    gasCostUSD: quote.estimate?.gasCosts?.[0]?.amountUSD || '0',
    steps: (quote.action ? [{ tool: quote.toolDetails?.name || 'LiFi', type: quote.action.fromChainId === quote.action.toChainId ? 'swap' : 'bridge' }] : []),
  };
}

export async function executeBridge(route: Route): Promise<Route> {
  return executeRoute(route, {
    updateRouteHook(updatedRoute) {
      console.log('[LiFi] Route updated:', updatedRoute.id);
    },
  });
}

export async function getBridgeStatus(
  txHash: string,
  fromChain: number,
  toChain: number,
): Promise<StatusResponse> {
  return getStatus({
    txHash,
    fromChain,
    toChain,
    bridge: 'across',
  });
}
