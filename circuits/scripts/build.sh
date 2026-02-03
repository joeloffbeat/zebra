#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Create build directory
mkdir -p build

# Compile circuit
echo "Compiling circuit..."
circom order_commitment.circom --r1cs --wasm --sym -o build/

# Download powers of tau if not exists
if [ ! -f "ptau/powersOfTau28_hez_final_16.ptau" ]; then
    echo "Downloading Powers of Tau..."
    mkdir -p ptau
    curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau -o ptau/powersOfTau28_hez_final_16.ptau
fi

# Generate proving key
echo "Generating proving key..."
snarkjs groth16 setup build/order_commitment.r1cs ptau/powersOfTau28_hez_final_16.ptau build/order_commitment_0000.zkey

# Export verification key
echo "Exporting verification key..."
snarkjs zkey export verificationkey build/order_commitment_0000.zkey build/order_commitment_vkey.json

echo "Build complete!"
