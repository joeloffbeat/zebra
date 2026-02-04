/**
 * Create a dark pool instance using already deployed package
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

const PACKAGE_ID = process.env.DARK_POOL_PACKAGE || '0x9e4fc5a3129441e3a964bdbf2776ec332a375a46d1a0bac624731abbf7874ebf';

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY environment variable not set');
  }

  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
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

  // create_pool returns (AdminCap, MatcherCap)
  const [adminCap, matcherCap] = tx.moveCall({
    target: `${packageId}::dark_pool::create_pool`,
    typeArguments: [
      '0x2::sui::SUI', // BaseAsset
      '0x2::sui::SUI', // QuoteAsset (using SUI for testnet, would be USDC in prod)
    ],
    arguments: [
      tx.pure(bcs.vector(bcs.u8()).serialize(vkBytes)),           // vk_bytes
      tx.pure(bcs.vector(bcs.u8()).serialize(poolId)),            // pool_id
      tx.pure(bcs.u64().serialize(1000000)),           // min_order_size (0.001 SUI)
      tx.pure(bcs.u64().serialize(1000000000000)),     // max_order_size (1000 SUI)
      tx.pure(bcs.u64().serialize(100)),               // fee_bps (1%)
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
  console.log('Transaction digest:', result.digest);

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
  console.log('=== Zebra Dark Pool - Create Pool ===\n');

  try {
    // 1. Get keypair
    const keypair = await getKeypair();
    console.log('Using address:', keypair.toSuiAddress());

    // 2. Load verification key
    const vkeyPath = path.join(__dirname, '../circuits/build/sui_vkey.json');
    let vkBytes: number[];
    if (fs.existsSync(vkeyPath)) {
      const vkeyData = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
      const hexStr = vkeyData.vk_bytes.slice(2);
      vkBytes = [];
      for (let i = 0; i < hexStr.length; i += 2) {
        vkBytes.push(parseInt(hexStr.substr(i, 2), 16));
      }
      console.log(`Loaded verification key (${vkBytes.length} bytes)`);
    } else {
      console.log('Warning: Using dummy verification key (circuits not built)');
      vkBytes = Array(256).fill(0);
    }

    // 3. Create pool
    const { poolObjectId, adminCapId, matcherCapId } = await createPool(keypair, PACKAGE_ID, vkBytes);

    // 4. Save deployment info
    await saveDeploymentInfo({
      packageId: PACKAGE_ID,
      poolObjectId,
      adminCapId,
      matcherCapId,
      network: NETWORK,
    });

    console.log('\n=== Pool Created Successfully ===');
    console.log(`Package: ${PACKAGE_ID}`);
    console.log(`Pool: ${poolObjectId}`);
    console.log(`MatcherCap: ${matcherCapId}`);
    console.log(`Explorer: https://suiscan.xyz/${NETWORK}/object/${poolObjectId}`);

  } catch (error) {
    console.error('\nFailed:', error);
    process.exit(1);
  }
}

main();
