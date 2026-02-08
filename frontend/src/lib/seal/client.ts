import { SealClient } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SEAL_PACKAGE_ID } from '../constants';

// Mainnet key server object IDs (set via NEXT_PUBLIC_SEAL_KEY_SERVERS env var, comma-separated)
const MAINNET_KEY_SERVERS: string[] = process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS
  ? process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS.split(',').map(s => s.trim())
  : [];

let sealClient: SealClient | null = null;

function getSealClient(): SealClient {
  if (!sealClient) {
    const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

    sealClient = new SealClient({
      suiClient,
      serverConfigs: MAINNET_KEY_SERVERS.map((id) => ({
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
