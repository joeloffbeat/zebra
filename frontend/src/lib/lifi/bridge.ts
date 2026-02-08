import { getRoutes, executeRoute, getStatus } from '@lifi/sdk';
import type { Route, StatusResponse } from '@lifi/sdk';
import { LIFI_CHAIN_IDS } from '../constants';

export interface BridgeQuote {
  route: Route;
  bridgeName: string;
  bridgeLogo: string;
  estimatedOutput: string;
  estimatedTime: number;
  gasCostUSD: string;
  totalFeesUSD: string;
  tags: string[];
  steps: { tool: string; type: string }[];
  toTokenSymbol: string;
  toTokenDecimals: number;
}

export async function getAllRoutesToSui(
  fromChainId: number,
  fromTokenAddress: string,
  fromAmount: string,
  fromAddress: string,
  toAddress: string,
  toTokenAddress: string,
): Promise<BridgeQuote[]> {
  const response = await getRoutes({
    fromChainId,
    fromTokenAddress,
    fromAmount,
    fromAddress,
    toChainId: LIFI_CHAIN_IDS.SUI,
    toTokenAddress,
    toAddress,
  });

  return response.routes.map((route) => {
    // Extract bridge name from the steps' tool details
    const bridgeName = route.steps
      .map((s) => s.toolDetails?.name || s.tool || 'LiFi')
      .join(' + ');

    // Use the first step's logo as the route logo
    const bridgeLogo = route.steps[0]?.toolDetails?.logoURI || '';

    // Sum gas costs across all steps
    const gasCostUSD = route.steps
      .reduce((sum, s) => {
        const stepGas = s.estimate?.gasCosts?.reduce(
          (g, c) => g + parseFloat(c.amountUSD || '0'),
          0,
        ) || 0;
        return sum + stepGas;
      }, 0)
      .toFixed(2);

    // Sum fee costs across all steps
    const totalFeesUSD = route.steps
      .reduce((sum, s) => {
        const stepFees = s.estimate?.feeCosts?.reduce(
          (f, c) => f + parseFloat(c.amountUSD || '0'),
          0,
        ) || 0;
        return sum + stepFees;
      }, 0)
      .toFixed(2);

    // Sum execution duration across steps
    const estimatedTime = route.steps.reduce(
      (sum, s) => sum + (s.estimate?.executionDuration || 0),
      0,
    );

    // Map included steps for display
    const steps = route.steps.flatMap((lifiStep) => {
      if (lifiStep.includedSteps && lifiStep.includedSteps.length > 0) {
        return lifiStep.includedSteps.map((sub) => ({
          tool: sub.toolDetails?.name || sub.tool || 'LiFi',
          type: sub.action.fromChainId === sub.action.toChainId ? 'swap' : 'bridge',
        }));
      }
      return [{
        tool: lifiStep.toolDetails?.name || lifiStep.tool || 'LiFi',
        type: lifiStep.action.fromChainId === lifiStep.action.toChainId ? 'swap' : 'bridge',
      }];
    });

    return {
      route,
      bridgeName,
      bridgeLogo,
      estimatedOutput: route.toAmount,
      estimatedTime,
      gasCostUSD,
      totalFeesUSD,
      tags: route.tags || [],
      steps,
      toTokenSymbol: route.toToken.symbol,
      toTokenDecimals: route.toToken.decimals,
    };
  });
}

export interface BridgeResult {
  sourceTxHash?: string;
  sourceTxLink?: string;
  destTxHash?: string;
  destTxLink?: string;
}

export async function executeBridge(
  route: Route,
  onProgressUpdate?: (result: BridgeResult) => void,
): Promise<BridgeResult> {
  const current: BridgeResult = {};

  const result = await executeRoute(route, {
    updateRouteHook(updatedRoute) {
      const processes = updatedRoute.steps?.flatMap((s) => s.execution?.process || []) || [];

      const crossChain = processes.find((p) => p.type === 'CROSS_CHAIN' && p.txHash);
      if (crossChain?.txHash && !current.sourceTxHash) {
        current.sourceTxHash = crossChain.txHash;
        current.sourceTxLink = crossChain.txLink;
        onProgressUpdate?.({ ...current });
      }

      const receiving = processes.find((p) => p.type === 'RECEIVING_CHAIN' && p.txHash);
      if (receiving?.txHash && !current.destTxHash) {
        current.destTxHash = receiving.txHash;
        current.destTxLink = receiving.txLink;
        onProgressUpdate?.({ ...current });
      }
    },
  });

  // Final extraction in case updateRouteHook missed anything
  const processes = result.steps?.flatMap((s) => s.execution?.process || []) || [];
  const crossChain = processes.find((p) => p.type === 'CROSS_CHAIN' && p.txHash);
  const receiving = processes.find((p) => p.type === 'RECEIVING_CHAIN' && p.txHash);

  return {
    sourceTxHash: crossChain?.txHash ?? current.sourceTxHash,
    sourceTxLink: crossChain?.txLink ?? current.sourceTxLink,
    destTxHash: receiving?.txHash ?? current.destTxHash,
    destTxLink: receiving?.txLink ?? current.destTxLink,
  };
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
  });
}
