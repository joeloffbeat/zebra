/**
 * Publish the Seal allowlist package to Sui mainnet using the TypeScript SDK.
 *
 * Usage: npx tsx scripts/publish-seal-allowlist.ts
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { execSync } from 'child_process';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

async function main() {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error('SUI_PRIVATE_KEY not set');
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();
  console.log('Publisher address:', address);

  // Check balance
  const balance = await client.getBalance({ owner: address });
  console.log('SUI balance:', Number(balance.totalBalance) / 1e9, 'SUI');

  if (Number(balance.totalBalance) < 100_000_000) {
    throw new Error('Insufficient SUI balance for publish (need ~0.1 SUI)');
  }

  // Build the package and get bytecode
  const packagePath = path.join(__dirname, '../contracts/seal-allowlist');
  console.log('\nBuilding package...');
  const buildOutput = execSync(
    `sui move build --dump-bytecode-as-base64 --path ${packagePath}`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );

  // Parse the JSON output (skip warning lines)
  const jsonLine = buildOutput.split('\n').find(line => line.startsWith('{'));
  if (!jsonLine) throw new Error('Could not parse build output');
  const { modules, dependencies } = JSON.parse(jsonLine);

  console.log(`Compiled ${modules.length} modules`);
  console.log(`Dependencies: ${dependencies.length}`);

  // Create publish transaction
  const tx = new Transaction();
  tx.setGasBudget(200_000_000); // 0.2 SUI budget

  const [upgradeCap] = tx.publish({
    modules,
    dependencies,
  });

  // Transfer UpgradeCap to publisher
  tx.transferObjects([upgradeCap], address);
  tx.setSender(address);

  console.log('\nPublishing to mainnet...');
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error('Publish failed:', JSON.stringify(result.effects?.status, null, 2));
    throw new Error('Publish transaction failed');
  }

  console.log('\nPublish successful!');
  console.log('Tx digest:', result.digest);

  // Find the published package ID
  const publishedChange = result.objectChanges?.find(
    (change: any) => change.type === 'published'
  );
  const packageId = publishedChange && 'packageId' in publishedChange ? publishedChange.packageId : null;

  if (!packageId) {
    console.error('Object changes:', JSON.stringify(result.objectChanges, null, 2));
    throw new Error('Could not find published package ID');
  }

  console.log('\n=== Published Package ===');
  console.log(`SEAL_ALLOWLIST_PACKAGE=${packageId}`);
  console.log(`Explorer: https://suiscan.xyz/mainnet/object/${packageId}`);
  console.log('\nAdd this to your .env file:');
  console.log(`SEAL_ALLOWLIST_PACKAGE=${packageId}`);
}

main().catch((err) => {
  console.error('\nPublish failed:', err);
  process.exit(1);
});
