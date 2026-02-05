/**
 * Flash Loan Test Script
 *
 * Borrows base asset from a DeepBook V3 pool and returns it immediately
 * in the same PTB (hot potato pattern). Verifies the tx succeeds on-chain.
 */

import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'testnet';
const POOL_KEY = 'SUI_DBUSDC';
const BORROW_AMOUNT = 0.001; // SUI

async function main() {
  console.log('=== DeepBook V3 Flash Loan Test ===\n');

  // Setup
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });
  const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();

  console.log('Address:', address);
  console.log('Pool:   ', POOL_KEY);
  console.log('Borrow: ', BORROW_AMOUNT, 'SUI\n');

  const dbClient = new DeepBookClient({
    address,
    network: NETWORK,
    client,
  });

  // Get mid price for reference
  try {
    const midPrice = await dbClient.midPrice(POOL_KEY);
    console.log(`DeepBook mid-price (${POOL_KEY}): ${midPrice}\n`);
  } catch (e) {
    console.log('Could not fetch mid-price (pool may be empty)\n');
  }

  // Build flash loan PTB
  console.log('--- Building flash loan transaction ---');
  const tx = new Transaction();
  tx.setGasBudget(50_000_000);

  const [baseAsset, flashLoan] = dbClient.flashLoans.borrowBaseAsset(
    POOL_KEY,
    BORROW_AMOUNT,
  )(tx as any);

  console.log('  borrowBaseAsset() added to PTB');

  // Return immediately (no intermediate operations in this demo)
  dbClient.flashLoans.returnBaseAsset(
    POOL_KEY,
    BORROW_AMOUNT,
    baseAsset,
    flashLoan,
  )(tx as any);

  console.log('  returnBaseAsset() added to PTB');

  // Execute
  console.log('\n--- Executing flash loan ---');
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  console.log('  Tx digest:', result.digest);
  console.log('  Status:   ', result.effects?.status?.status);

  if (result.effects?.status?.status !== 'success') {
    console.error('  ERROR:', JSON.stringify(result.effects?.status));
    throw new Error('Flash loan transaction failed');
  }

  console.log('\n========================================');
  console.log('     FLASH LOAN TEST RESULT: SUCCESS    ');
  console.log('========================================');
  console.log(`  Pool:    ${POOL_KEY}`);
  console.log(`  Borrowed: ${BORROW_AMOUNT} SUI`);
  console.log(`  Returned: ${BORROW_AMOUNT} SUI`);
  console.log(`  Tx:      ${result.digest}`);
  console.log(`  Explorer: https://suiscan.xyz/${NETWORK}/tx/${result.digest}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\n*** FLASH LOAN TEST FAILED ***');
  console.error(err);
  process.exit(1);
});
