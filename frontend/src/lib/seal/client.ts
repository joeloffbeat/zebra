import { SealClient } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// Seal package for allowlist-based access control
const SEAL_PACKAGE_ID = '0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82';

// Testnet key server object IDs
const TESTNET_KEY_SERVERS = [
  '0x7d57e79c9e3e3c2a4f1e6e9f1b2c3d4e5f6a7b8c',
  '0x8e68f80d0e4e4d3b5a2f7f0b2c3d4e5f6a7b8c9d',
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
  expiry: bigint;
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
    expiry: orderData.expiry.toString(),
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
