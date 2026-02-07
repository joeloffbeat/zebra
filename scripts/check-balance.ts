import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const addr = kp.toSuiAddress();
console.log('Address:', addr);

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });
const balance = await client.getBalance({ owner: addr });
console.log('Balance:', Number(balance.totalBalance) / 1e9, 'SUI');
