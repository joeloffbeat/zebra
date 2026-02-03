import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export const NETWORK = 'testnet';

export const suiClient = new SuiClient({
  url: getFullnodeUrl(NETWORK),
});

export const CONTRACTS = {
  DARK_POOL_PACKAGE: process.env.NEXT_PUBLIC_DARK_POOL_PACKAGE || '0x9e4fc5a3129441e3a964bdbf2776ec332a375a46d1a0bac624731abbf7874ebf',
  DARK_POOL_OBJECT: process.env.NEXT_PUBLIC_DARK_POOL_OBJECT || '0x7934c4fd0158a853a81313d9a6a0573a1b3d041dd6a2ae17b3487472d0f70374',
};

export function setContractAddresses(packageId: string, poolObjectId: string) {
  CONTRACTS.DARK_POOL_PACKAGE = packageId;
  CONTRACTS.DARK_POOL_OBJECT = poolObjectId;
}

export { Transaction };
