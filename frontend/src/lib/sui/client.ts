import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { DARK_POOL_PACKAGE, DARK_POOL_OBJECT } from '../constants';

export const NETWORK = 'mainnet';

export const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(NETWORK),
  network: NETWORK,
});

export const CONTRACTS = {
  DARK_POOL_PACKAGE,
  DARK_POOL_OBJECT,
};

export { Transaction };
