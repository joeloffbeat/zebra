/**
 * Set up Seal allowlist for Zebra Dark Pool
 *
 * Creates an on-chain allowlist and adds the matching engine address.
 * The allowlist controls who can decrypt Seal-encrypted order data.
 *
 * Usage:
 *   npx tsx scripts/setup-seal.ts
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

// Seal allowlist package on testnet
const SEAL_PACKAGE_ID = '0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82';

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error('SUI_PRIVATE_KEY not set');
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function main() {
  console.log('=== Seal Allowlist Setup ===\n');

  const keypair = await getKeypair();
  const address = keypair.toSuiAddress();
  const matcherAddress = process.env.MATCHER_ADDRESS || address;
  console.log('Admin address:', address);
  console.log('Matcher address:', matcherAddress);

  // Step 1: Create allowlist
  console.log('\nStep 1: Creating allowlist...');
  const tx = new Transaction();
  tx.setGasBudget(50000000);

  const [allowlist, cap] = tx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::create_allowlist_entry`,
    arguments: [
      tx.pure.string('zebra-dark-pool'),
    ],
  });

  // Step 2: Add matcher address to allowlist
  tx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::add`,
    arguments: [
      allowlist,
      cap,
      tx.pure.address(matcherAddress),
    ],
  });

  // Transfer cap to admin
  tx.transferObjects([cap], address);
  // Share allowlist
  tx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::share`,
    arguments: [allowlist],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error('Failed to create allowlist: ' + JSON.stringify(result.effects?.status));
  }

  // Find allowlist ID
  const allowlistId = result.objectChanges?.find(
    (change) => change.type === 'created' && 'objectType' in change &&
    change.objectType?.includes('Allowlist')
  )?.objectId;

  const capId = result.objectChanges?.find(
    (change) => change.type === 'created' && 'objectType' in change &&
    change.objectType?.includes('Cap')
  )?.objectId;

  console.log('Allowlist created!');
  console.log('Allowlist ID:', allowlistId);
  console.log('Cap ID:', capId);
  console.log('Tx:', result.digest);

  // Update .env
  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const updates = [
    `SEAL_ALLOWLIST_ID=${allowlistId || ''}`,
    `SEAL_CAP_ID=${capId || ''}`,
  ];

  for (const update of updates) {
    const [key] = update.split('=');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, update);
    } else {
      envContent += `\n${update}`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('\nEnvironment variables updated in .env');
  console.log('\nAdd NEXT_PUBLIC_SEAL_ALLOWLIST_ID to your frontend .env.local as well.');
}

main().catch(console.error);
