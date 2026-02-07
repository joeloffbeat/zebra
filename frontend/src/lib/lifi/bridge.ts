import { getQuote, executeRoute, getStatus, convertQuoteToRoute } from '@lifi/sdk';
import type { Route, StatusResponse } from '@lifi/sdk';
import { LIFI_CHAIN_IDS, SUI_USDC_ADDRESS, USDC_BY_CHAIN } from '../constants';

export interface BridgeQuote {
  route: Route;
  estimatedOutput: string;
  estimatedTime: number;
  gasCostUSD: string;
  steps: { tool: string; type: string }[];
}

export async function getQuoteToSui(
  fromChainId: number,
  fromAmount: string,
  fromAddress: string,
  toAddress: string,
): Promise<BridgeQuote> {
  const fromToken = USDC_BY_CHAIN[fromChainId];
  if (!fromToken) throw new Error(`Unsupported source chain: ${fromChainId}`);

  const quote = await getQuote({
    fromChain: fromChainId,
    toChain: LIFI_CHAIN_IDS.SUI,
    fromToken,
    toToken: SUI_USDC_ADDRESS,
    fromAmount,
    fromAddress,
    toAddress,
  });

  const route = convertQuoteToRoute(quote);

  return {
    route,
    estimatedOutput: quote.estimate?.toAmount || '0',
    estimatedTime: quote.estimate?.executionDuration || 0,
    gasCostUSD: quote.estimate?.gasCosts?.[0]?.amountUSD || '0',
    steps: (quote.includedSteps || [quote]).map(step => ({
      tool: step.toolDetails?.name || step.tool || 'LiFi',
      type: step.action.fromChainId === step.action.toChainId ? 'swap' : 'bridge',
    })),
  };
}

export async function executeBridge(route: Route): Promise<{ txHash?: string }> {
  const result = await executeRoute(route, {
    updateRouteHook(updatedRoute) {
      console.log('[LiFi] Route updated:', updatedRoute.id);
    },
  });

  const txHash = result.steps?.[0]?.execution?.process?.[0]?.txHash;
  return { txHash };
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
