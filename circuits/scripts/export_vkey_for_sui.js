const fs = require('fs');
const path = require('path');

// Read the verification key
const vkeyPath = path.join(__dirname, '../build/order_commitment_vkey.json');
const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));

// BN254 base field prime
const p = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const halfP = (p - 1n) / 2n;

// Helper to convert field element string to 32-byte little-endian hex
function fieldToLE(field) {
    const bn = BigInt(field);
    const beHex = bn.toString(16).padStart(64, '0');
    let leHex = '';
    for (let i = 62; i >= 0; i -= 2) {
        leHex += beHex.slice(i, i + 2);
    }
    return leHex;
}

// G1 compressed: 32 bytes = x coordinate LE with y sign flag in top bit of last byte
// Arkworks: 0x80 flag means y > -y (y > halfP)
function g1Compressed(point) {
    let leHex = fieldToLE(point[0]);
    const y = BigInt(point[1]);

    if (y > halfP) {
        let lastByte = parseInt(leHex.slice(62, 64), 16);
        lastByte |= 0x80;
        leHex = leHex.slice(0, 62) + lastByte.toString(16).padStart(2, '0');
    }
    return leHex;
}

// G2 compressed: 64 bytes = x.c0 LE (32) + x.c1 LE (32) with y sign flag in top bit of last byte
// Fp2 sign uses lexicographic ordering: compare c1 first, then c0
function g2Compressed(point) {
    let c0Hex = fieldToLE(point[0][0]);
    let c1Hex = fieldToLE(point[0][1]);

    const y_c0 = BigInt(point[1][0]);
    const y_c1 = BigInt(point[1][1]);

    // Determine if y > -y in Fp2 lexicographic order
    let yIsPositive;
    if (y_c1 !== 0n) {
        yIsPositive = y_c1 > halfP;
    } else {
        yIsPositive = y_c0 > halfP;
    }

    if (yIsPositive) {
        let lastByte = parseInt(c1Hex.slice(62, 64), 16);
        lastByte |= 0x80;
        c1Hex = c1Hex.slice(0, 62) + lastByte.toString(16).padStart(2, '0');
    }

    return c0Hex + c1Hex;
}

// Helper to write u64 as little-endian hex (8 bytes)
function u64ToLE(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value));
    return buf.toString('hex');
}

// Build verification key bytes for Sui
// Format: Arkworks VerifyingKey<Bn254> COMPRESSED serialization
let vkBytes = '';

// 1. Alpha G1 (32 bytes compressed)
vkBytes += g1Compressed(vkey.vk_alpha_1);

// 2. Beta G2 (64 bytes compressed)
vkBytes += g2Compressed(vkey.vk_beta_2);

// 3. Gamma G2 (64 bytes compressed)
vkBytes += g2Compressed(vkey.vk_gamma_2);

// 4. Delta G2 (64 bytes compressed)
vkBytes += g2Compressed(vkey.vk_delta_2);

// 5. IC (gamma_abc_g1) — Vec<G1Affine> with u64 LE length prefix
const icCount = vkey.IC.length;
vkBytes += u64ToLE(icCount); // u64 length prefix (8 bytes)
for (const ic of vkey.IC) {
    vkBytes += g1Compressed(ic); // each 32 bytes compressed
}

const output = {
    vk_bytes: '0x' + vkBytes,
    curve: 'bn254',
    nPublic: vkey.nPublic,
    ic_count: icCount,
    raw_vkey: vkey
};

const outputPath = path.join(__dirname, '../build/sui_vkey.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('Sui verification key exported to:', outputPath);
console.log('Number of public inputs:', vkey.nPublic);
console.log('IC count:', icCount);
console.log('VK bytes length:', vkBytes.length / 2, 'bytes');
console.log('  Alpha G1: 32 bytes (compressed)');
console.log('  Beta G2: 64 bytes (compressed)');
console.log('  Gamma G2: 64 bytes (compressed)');
console.log('  Delta G2: 64 bytes (compressed)');
console.log('  IC length prefix: 8 bytes');
console.log('  IC points:', icCount, 'x 32 =', icCount * 32, 'bytes (compressed)');
console.log('  Total:', 32 + 64 + 64 + 64 + 8 + icCount * 32, 'bytes');
console.log('Encoding: compressed little-endian (Arkworks/Sui compatible)');
