import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DARK_POOL_PACKAGE, DARK_POOL_OBJECT, MATCHER_CAP_ID, SEAL_PACKAGE_ID, SEAL_ALLOWLIST_ID, USDC_TYPE } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try project root .env first (local dev), then parent dir (Docker), then CWD
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config(); // also check CWD/.env

export const config = {
  suiRpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
  suiPrivateKey: process.env.SUI_PRIVATE_KEY || '',
  darkPoolPackage: DARK_POOL_PACKAGE,
  darkPoolObject: DARK_POOL_OBJECT,
  matcherCapId: MATCHER_CAP_ID,
  sealPackageId: SEAL_PACKAGE_ID,
  sealAllowlistId: SEAL_ALLOWLIST_ID,
  usdcType: USDC_TYPE,
  port: parseInt(process.env.PORT || '3006'),
  teeMode: process.env.TEE_MODE || 'local-dev',
  enclaveKeyPath: process.env.ENCLAVE_KEY_PATH || '/app/ecdsa.sec',
};
