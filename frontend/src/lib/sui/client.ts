import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

export const NETWORK = 'testnet';

export const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(NETWORK),
  network: NETWORK,
});

export const CONTRACTS = {
  DARK_POOL_PACKAGE: process.env.NEXT_PUBLIC_DARK_POOL_PACKAGE || '0x3c6a4a56672936382afbfa4c74d21373f25eefaa38b4b809c69fb9488a6b2417',
  DARK_POOL_OBJECT: process.env.NEXT_PUBLIC_DARK_POOL_OBJECT || '0x96ff4e93a6737673e712caa4f3e3df437a6ed5c83d1e74bf180dac84fdb6012e',
};

export function setContractAddresses(packageId: string, poolObjectId: string) {
  CONTRACTS.DARK_POOL_PACKAGE = packageId;
  CONTRACTS.DARK_POOL_OBJECT = poolObjectId;
}

export { Transaction };
