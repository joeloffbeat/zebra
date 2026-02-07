import { SealClient } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SEAL_PACKAGE_ID } from '../constants';

// Testnet key server object IDs (real, verified working)
const TESTNET_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

let sealClient: SealClient | null = null;

function getSealClient(): SealClient {
  if (!sealClient) {
    const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' });

    sealClient = new SealClient({
      suiClient,
      serverConfigs: TESTNET_KEY_SERVERS.map((id) => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: false,
    });
  }
  return sealClient;
}

export interface OrderData {
  side: number; // 0 = sell, 1 = buy
  price: bigint;
  amount: bigint;
  receivers?: { address: string; percentage: number }[];
}

export interface EncryptedOrderResult {
  encryptedBytes: Uint8Array;
  backupKey: Uint8Array;
}

export async function encryptOrderData(
  orderData: OrderData,
  allowlistId: string,
): Promise<EncryptedOrderResult> {
  const client = getSealClient();

  // Serialize order data to bytes
  const encoder = new TextEncoder();
  const dataStr = JSON.stringify({
    side: orderData.side,
    price: orderData.price.toString(),
    amount: orderData.amount.toString(),
    ...(orderData.receivers && orderData.receivers.length > 0 ? { receivers: orderData.receivers } : {}),
  });
  const dataBytes = encoder.encode(dataStr);

  // Encrypt using Seal with threshold encryption
  const { encryptedObject, key } = await client.encrypt({
    threshold: 2,
    packageId: SEAL_PACKAGE_ID,
    id: allowlistId,
    data: dataBytes,
  });

  return {
    encryptedBytes: encryptedObject,
    backupKey: key,
  };
}
