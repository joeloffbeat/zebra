/**
 * Deploy Zebra Dark Pool to Sui Testnet
 *
 * Privacy-preserving contract with single CoinType, unified submit_order,
 * payout-based settlement, and stripped events.
 *
 * Usage:
 * SUI_PRIVATE_KEY=suiprivkey1... npx tsx scripts/deploy.ts
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY environment variable not set');
  }

  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function buildContracts(): Promise<string> {
  console.log('Building Move contracts...');
  const contractsDir = path.join(__dirname, '../contracts');

  try {
    execSync('sui move build', { cwd: contractsDir, stdio: 'inherit' });
    console.log('Build successful!');
    return contractsDir;
  } catch (error) {
    throw new Error('Failed to build contracts');
  }
}

async function publishPackage(keypair: Ed25519Keypair): Promise<{ packageId: string; digest: string }> {
  console.log('\nPublishing package to testnet...');
  const address = keypair.toSuiAddress();
  console.log('Deployer address:', address);

  // Check balance
  const balance = await client.getBalance({ owner: address });
  console.log('Balance:', Number(balance.totalBalance) / 1e9, 'SUI');

  if (Number(balance.totalBalance) < 100000000) {
    console.log('\nInsufficient balance. Please fund the address with testnet SUI.');
    console.log('Get testnet SUI from: https://faucet.sui.io/');
    throw new Error('Insufficient balance');
  }

  // Build the transaction
  const contractsDir = path.join(__dirname, '../contracts');
  const buildPath = path.join(contractsDir, 'build/zebra');

  // Read compiled modules
  const modulesPath = path.join(buildPath, 'bytecode_modules');
  const modules = fs.readdirSync(modulesPath)
    .filter(f => f.endsWith('.mv'))
    .map(f => Array.from(fs.readFileSync(path.join(modulesPath, f))));

  const tx = new Transaction();
  tx.setGasBudget(100000000);

  const [upgradeCap] = tx.publish({
    modules,
    dependencies: [
      '0x0000000000000000000000000000000000000000000000000000000000000001', // std
      '0x0000000000000000000000000000000000000000000000000000000000000002', // sui
    ],
  });

  tx.transferObjects([upgradeCap], address);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error('Transaction failed: ' + JSON.stringify(result.effects?.status));
  }

  // Find package ID from created objects
  const packageId = result.objectChanges?.find(
    (change) => change.type === 'published'
  )?.packageId;

  if (!packageId) {
    throw new Error('Could not find package ID in transaction result');
  }

  console.log('\nPackage published successfully!');
  console.log('Package ID:', packageId);
  console.log('Transaction digest:', result.digest);

  return { packageId, digest: result.digest };
}

async function createPool(
  keypair: Ed25519Keypair,
  packageId: string,
  vkBytes: number[]
): Promise<{ poolObjectId: string; adminCapId: string; matcherCapId: string }> {
  console.log('\nCreating dark pool...');

  const tx = new Transaction();
  tx.setGasBudget(50000000);

  const poolId = Array.from(new TextEncoder().encode('ZEBRA_POOL_1'));

  // Single type argument: CoinType = SUI
  const [adminCap, matcherCap] = tx.moveCall({
    target: `${packageId}::dark_pool::create_pool`,
    typeArguments: [
      '0x2::sui::SUI',
    ],
    arguments: [
      tx.pure(bcs.vector(bcs.u8()).serialize(vkBytes)),           // vk_bytes
      tx.pure(bcs.vector(bcs.u8()).serialize(poolId)),            // pool_id
      tx.pure(bcs.u64().serialize(1000000)),           // min_order_size (0.001 SUI)
      tx.pure(bcs.u64().serialize(1000000000000)),     // max_order_size (1000 SUI)
    ],
  });

  // Transfer AdminCap to deployer, MatcherCap to matching engine
  const matcherAddress = process.env.MATCHER_ADDRESS || keypair.toSuiAddress();
  tx.transferObjects([adminCap], keypair.toSuiAddress());
  tx.transferObjects([matcherCap], matcherAddress);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error('Failed to create pool: ' + JSON.stringify(result.effects?.status));
  }

  // Find pool object ID (shared object)
  const poolObjectId = result.objectChanges?.find(
    (change) => change.type === 'created' && 'objectType' in change &&
    change.objectType?.includes('DarkPool')
  )?.objectId;

  // Find admin cap ID
  const adminCapId = result.objectChanges?.find(
    (change) => change.type === 'created' && 'objectType' in change &&
    change.objectType?.includes('AdminCap')
  )?.objectId;

  // Find matcher cap ID
  const matcherCapId = result.objectChanges?.find(
    (change) => change.type === 'created' && 'objectType' in change &&
    change.objectType?.includes('MatcherCap')
  )?.objectId;

  if (!poolObjectId) {
    throw new Error('Could not find pool object ID');
  }

  console.log('Pool created successfully!');
  console.log('Pool Object ID:', poolObjectId);
  console.log('Admin Cap ID:', adminCapId);
  console.log('Matcher Cap ID:', matcherCapId);
  console.log('Matcher Address:', matcherAddress);

  return {
    poolObjectId,
    adminCapId: adminCapId || '',
    matcherCapId: matcherCapId || '',
  };
}

async function saveDeploymentInfo(info: {
  packageId: string;
  poolObjectId: string;
  adminCapId: string;
  matcherCapId: string;
  network: string;
}) {
  const deploymentPath = path.join(__dirname, '../deployed.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(info, null, 2));
  console.log('\nDeployment info saved to deployed.json');

  // Update .env file
  const envPath = path.join(__dirname, '../.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Add or update deployment variables
  const updates = [
    `DARK_POOL_PACKAGE=${info.packageId}`,
    `DARK_POOL_OBJECT=${info.poolObjectId}`,
    `ADMIN_CAP_ID=${info.adminCapId}`,
    `MATCHER_CAP_ID=${info.matcherCapId}`,
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
  console.log('Environment variables updated in .env');
}

async function main() {
  console.log('=== Zebra Dark Pool Deployment (Privacy Rewrite) ===\n');

  try {
    // 1. Get keypair
    const keypair = await getKeypair();
    console.log('Using address:', keypair.toSuiAddress());

    // 2. Build contracts
    await buildContracts();

    // 3. Publish package
    const { packageId, digest: publishDigest } = await publishPackage(keypair);

    // Wait for publish transaction to finalize before creating pool
    console.log('\nWaiting for publish transaction to finalize...');
    await client.waitForTransaction({ digest: publishDigest });
    console.log('Publish transaction finalized.');

    // 4. Load verification key from circuit build
    const vkeyPath = path.join(__dirname, '../circuits/build/sui_vkey.json');
    let vkBytes: number[];
    if (fs.existsSync(vkeyPath)) {
      const vkeyData = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
      // Convert hex string to byte array
      const hexStr = vkeyData.vk_bytes.slice(2); // remove '0x'
      vkBytes = [];
      for (let i = 0; i < hexStr.length; i += 2) {
        vkBytes.push(parseInt(hexStr.substr(i, 2), 16));
      }
      console.log(`Loaded verification key (${vkBytes.length} bytes)`);
    } else {
      console.log('Warning: Using dummy verification key (circuits not built)');
      vkBytes = Array(256).fill(0);
    }
    const { poolObjectId, adminCapId, matcherCapId } = await createPool(keypair, packageId, vkBytes);

    // 5. Save deployment info
    await saveDeploymentInfo({
      packageId,
      poolObjectId,
      adminCapId,
      matcherCapId,
      network: NETWORK,
    });

    console.log('\n=== Deployment Complete ===');
    console.log(`Package: ${packageId}`);
    console.log(`Pool: ${poolObjectId}`);
    console.log(`MatcherCap: ${matcherCapId}`);
    console.log(`Explorer: https://suiscan.xyz/${NETWORK}/object/${packageId}`);

  } catch (error) {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  }
}

main();
