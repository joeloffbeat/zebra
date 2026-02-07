/**
 * Test the full Zebra dark pool flow
 *
 * Usage:
 * SUI_PRIVATE_KEY=suiprivkey1... npx tsx scripts/test-flow.ts
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

const NETWORK = 'mainnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

interface DeploymentInfo {
  packageId: string;
  poolObjectId: string;
  adminCapId: string;
  network: string;
}

async function loadDeployment(): Promise<DeploymentInfo> {
  const deploymentPath = path.join(__dirname, '../deployed.json');
  if (!fs.existsSync(deploymentPath)) {
    throw new Error('deployed.json not found. Run deploy.ts first.');
  }
  return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
}

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY environment variable not set');
  }

  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function testSubmitOrder(
  keypair: Ed25519Keypair,
  deployment: DeploymentInfo,
  isBid: boolean
): Promise<string> {
  const address = keypair.toSuiAddress();
  console.log(`\nSubmitting ${isBid ? 'BUY' : 'SELL'} order...`);

  // Get a coin to use
  const coins = await client.getCoins({ owner: address, coinType: '0x2::sui::SUI' });
  if (coins.data.length === 0) {
    throw new Error('No SUI coins available');
  }

  // Use a small amount
  const coinToUse = coins.data.find(c => Number(c.balance) > 100000000);
  if (!coinToUse) {
    throw new Error('No coin with sufficient balance');
  }

  const tx = new Transaction();
  tx.setGasBudget(50000000);

  // Split off 0.1 SUI for the order
  const [orderCoin] = tx.splitCoins(tx.object(coinToUse.coinObjectId), [100000000]);

  // Create dummy proof data (for testing without actual ZK proof)
  const dummyProof = Array(256).fill(0);
  const dummyPublicInputs = Array(160).fill(0); // 5 public inputs * 32 bytes
  const commitment = Array(32).fill(isBid ? 1 : 2); // Different for buy/sell
  const nullifier = Array(32).fill(Date.now() % 256);
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  const target = isBid
    ? `${deployment.packageId}::dark_pool::submit_buy_order`
    : `${deployment.packageId}::dark_pool::submit_sell_order`;

  tx.moveCall({
    target,
    typeArguments: [
      '0x2::sui::SUI',
      '0x2::sui::SUI',
    ],
    arguments: [
      tx.object(deployment.poolObjectId),
      orderCoin,
      tx.pure(bcs.vector(bcs.u8()).serialize(dummyProof)),
      tx.pure(bcs.vector(bcs.u8()).serialize(dummyPublicInputs)),
      tx.pure(bcs.vector(bcs.u8()).serialize(commitment)),
      tx.pure(bcs.vector(bcs.u8()).serialize(nullifier)),
      tx.pure(bcs.u64().serialize(expiry)),
    ],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (result.effects?.status?.status === 'success') {
      console.log(`✓ ${isBid ? 'BUY' : 'SELL'} order submitted!`);
      console.log('  Digest:', result.digest);

      // Check for events
      if (result.events && result.events.length > 0) {
        console.log('  Events:');
        result.events.forEach(e => {
          console.log(`    - ${e.type}`);
        });
      }

      return result.digest;
    } else {
      console.log(`✗ Order failed: ${result.effects?.status?.error}`);
      return '';
    }
  } catch (error: any) {
    // Expected to fail with dummy proof
    if (error.message?.includes('EInvalidProof')) {
      console.log('  (Expected: Invalid proof - use real ZK proof in production)');
    } else {
      console.log(`  Error: ${error.message}`);
    }
    return '';
  }
}

async function checkPoolState(deployment: DeploymentInfo): Promise<void> {
  console.log('\nChecking pool state...');

  try {
    const poolObject = await client.getObject({
      id: deployment.poolObjectId,
      options: { showContent: true },
    });

    if (poolObject.data?.content?.dataType === 'moveObject') {
      const fields = (poolObject.data.content as any).fields;
      console.log('Pool ID:', deployment.poolObjectId);
      console.log('Pool type:', poolObject.data.content.type);
    }
  } catch (error) {
    console.log('Could not fetch pool state:', error);
  }
}

async function main() {
  console.log('=== Zebra Dark Pool Test ===\n');

  try {
    // 1. Load deployment info
    const deployment = await loadDeployment();
    console.log('Loaded deployment:');
    console.log('  Package:', deployment.packageId);
    console.log('  Pool:', deployment.poolObjectId);

    // 2. Get keypair
    const keypair = await getKeypair();
    const address = keypair.toSuiAddress();
    console.log('\nTest address:', address);

    // 3. Check balance
    const balance = await client.getBalance({ owner: address });
    console.log('Balance:', Number(balance.totalBalance) / 1e9, 'SUI');

    // 4. Check pool state
    await checkPoolState(deployment);

    // 5. Test order submission (will fail with dummy proof, but tests the contract call)
    console.log('\n--- Testing Order Submission ---');
    console.log('(Note: Orders will fail ZK verification with dummy proofs)');

    await testSubmitOrder(keypair, deployment, true);  // Buy order
    await testSubmitOrder(keypair, deployment, false); // Sell order

    console.log('\n=== Test Complete ===');
    console.log('Note: Full ZK proof testing requires compiled circuits.');

  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  }
}

main();
