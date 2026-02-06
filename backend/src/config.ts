import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try project root .env first (local dev), then parent dir (Docker), then CWD
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config(); // also check CWD/.env

export const config = {
  suiRpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
  suiPrivateKey: process.env.SUI_PRIVATE_KEY || '',
  darkPoolPackage: process.env.DARK_POOL_PACKAGE || '',
  darkPoolObject: process.env.DARK_POOL_OBJECT || '',
  matcherCapId: process.env.MATCHER_CAP_ID || '',
  sealPackageId: process.env.SEAL_PACKAGE_ID || '0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82',
  sealAllowlistId: process.env.SEAL_ALLOWLIST_ID || '',
  port: parseInt(process.env.PORT || '3001'),
  teeMode: process.env.TEE_MODE || 'local-dev',
  enclaveKeyPath: process.env.ENCLAVE_KEY_PATH || '/app/ecdsa.sec',
};
