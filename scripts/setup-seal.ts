/**
 * Set up Seal allowlist for Zebra Dark Pool
 *
 * Creates an on-chain allowlist and adds the matching engine address.
 * The allowlist controls who can decrypt Seal-encrypted order data.
 *
 * Based on proven playground pattern (12/12 tests passing).
 *
 * Usage:
 *   npx tsx scripts/setup-seal.ts
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SealClient, SessionKey } from '@mysten/seal';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: 'testnet' });

// Seal testnet package — already deployed, NO need to deploy our own
const SEAL_PACKAGE_ID = '0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82';

// Real testnet key servers (verified working in playground)
const KEY_SERVER_IDS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error('SUI_PRIVATE_KEY not set');
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function main() {
  console.log('=== Seal Allowlist Setup for Zebra ===\n');

  const keypair = await getKeypair();
  const address = keypair.toSuiAddress();
  const matcherAddress = process.env.MATCHER_ADDRESS || address;
  console.log('Admin address:', address);
  console.log('Matcher/TEE address:', matcherAddress);

  // Step 1: Create allowlist
  console.log('\nStep 1: Creating allowlist...');
  const tx = new Transaction();
  tx.setGasBudget(50_000_000);

  // create_allowlist_entry takes a name string (verified in playground)
  tx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::create_allowlist_entry`,
    arguments: [
      tx.pure.string('zebra-dark-pool'),
    ],
  });

  tx.setSender(address);

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

  // Find created objects
  const createdObjects = result.objectChanges?.filter(
    (change: any) => change.type === 'created'
  ) || [];

  const allowlistObj = createdObjects.find((obj: any) =>
    obj.objectType?.includes('allowlist::Allowlist')
  );
  const capObj = createdObjects.find((obj: any) =>
    obj.objectType?.includes('allowlist::Cap')
  );

  const allowlistId = allowlistObj && 'objectId' in allowlistObj ? allowlistObj.objectId : null;
  const capId = capObj && 'objectId' in capObj ? capObj.objectId : null;

  if (!allowlistId || !capId) {
    throw new Error('Could not find Allowlist or Cap in transaction results');
  }

  console.log('Allowlist created!');
  console.log('Allowlist ID:', allowlistId);
  console.log('Cap ID:', capId);
  console.log('Tx:', result.digest);

  // Wait for finalization before using new objects
  console.log('\nWaiting 3 seconds for transaction finalization...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Step 2: Add matcher/TEE address to allowlist
  console.log('\nStep 2: Adding matcher address to allowlist...');
  const addTx = new Transaction();
  addTx.setGasBudget(10_000_000);

  addTx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::add`,
    arguments: [
      addTx.object(allowlistId),
      addTx.object(capId),
      addTx.pure.address(matcherAddress),
    ],
  });

  addTx.setSender(address);

  const addResult = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: addTx,
    options: { showEffects: true },
  });

  if (addResult.effects?.status?.status !== 'success') {
    throw new Error('Failed to add address: ' + JSON.stringify(addResult.effects?.status));
  }

  console.log('Address added to allowlist!');
  console.log('Tx:', addResult.digest);

  // Step 3: Verify Seal round-trip
  console.log('\nStep 3: Verifying Seal encrypt/decrypt round-trip...');

  const sealClient = new SealClient({
    suiClient: client,
    serverConfigs: KEY_SERVER_IDS.map(objectId => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });

  const testData = JSON.stringify({ side: 1, price: '1000000000', amount: '3000000', expiry: '9999999999' });
  const testBytes = new TextEncoder().encode(testData);

  const { encryptedObject } = await sealClient.encrypt({
    threshold: 2,
    packageId: SEAL_PACKAGE_ID,
    id: allowlistId,
    data: testBytes,
  });

  console.log(`Encrypted ${testBytes.length} bytes → ${encryptedObject.length} bytes`);

  // Try decryption with the matcher keypair
  const sessionKey = await SessionKey.create({
    address: matcherAddress,
    packageId: SEAL_PACKAGE_ID,
    ttlMin: 10,
    suiClient: client,
  });

  const msg = sessionKey.getPersonalMessage();
  const sig = await keypair.signPersonalMessage(msg);
  sessionKey.setPersonalMessageSignature(sig.signature);

  const decryptTx = new Transaction();
  const idBytes = Buffer.from(allowlistId.replace('0x', ''), 'hex');
  decryptTx.moveCall({
    target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
    arguments: [
      decryptTx.pure.vector('u8', Array.from(idBytes)),
      decryptTx.object(allowlistId),
    ],
  });
  const txBytes = await decryptTx.build({ client, onlyTransactionKind: true });

  const decryptedBytes = await sealClient.decrypt({
    data: encryptedObject,
    sessionKey,
    txBytes,
  });

  const decryptedStr = new TextDecoder().decode(decryptedBytes);
  const match = decryptedStr === testData;
  console.log(`Decryption ${match ? 'VERIFIED' : 'FAILED'}!`);
  if (!match) {
    console.error('Expected:', testData);
    console.error('Got:', decryptedStr);
    throw new Error('Seal round-trip verification failed');
  }

  // Step 4: Update .env files
  console.log('\nStep 4: Updating environment variables...');

  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const updates = [
    `SEAL_PACKAGE_ID=${SEAL_PACKAGE_ID}`,
    `SEAL_ALLOWLIST_ID=${allowlistId}`,
    `SEAL_CAP_ID=${capId}`,
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
  console.log('Updated .env');

  // Update frontend .env.local
  const frontendEnvPath = path.join(__dirname, '../frontend/.env.local');
  let frontendEnv = fs.existsSync(frontendEnvPath) ? fs.readFileSync(frontendEnvPath, 'utf8') : '';

  const frontendUpdates = [
    `NEXT_PUBLIC_SEAL_PACKAGE_ID=${SEAL_PACKAGE_ID}`,
    `NEXT_PUBLIC_SEAL_ALLOWLIST_ID=${allowlistId}`,
  ];

  for (const update of frontendUpdates) {
    const [key] = update.split('=');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (frontendEnv.match(regex)) {
      frontendEnv = frontendEnv.replace(regex, update);
    } else {
      frontendEnv += `\n${update}`;
    }
  }

  fs.writeFileSync(frontendEnvPath, frontendEnv.trim() + '\n');
  console.log('Updated frontend/.env.local');

  console.log('\n=== Setup Complete ===');
  console.log(`SEAL_PACKAGE_ID=${SEAL_PACKAGE_ID}`);
  console.log(`SEAL_ALLOWLIST_ID=${allowlistId}`);
  console.log(`SEAL_CAP_ID=${capId}`);
  console.log(`Explorer: https://suiscan.xyz/${NETWORK}/object/${allowlistId}`);
}

main().catch((err) => {
  console.error('\nSetup failed:', err);
  process.exit(1);
});
