# Generate Pitch Deck: Zebra

Use the `pitch-deck-generator` skill to create a hackathon pitch deck for Zebra.

## Project Info

**App Name:** Zebra
**Tagline:** Sui-native ZK dark pool. On-chain proofs. Hidden orders. Stripes hide.
**Hackathon:** HackMoney 2026
**Accent Color:** #FFFFFF with #000000 (Black & White)

## Problem Narrative

"You want to buy $100k of SUI at $1.20. You place a limit order. Instantly visible. A bot sees it, pushes the price to $1.21 so your order never fills, then dumps. Or worse - your large order signals intent and moves the market against you before you even execute. Institutional traders have dark pools for exactly this reason. Retail? We're stuck with our orders on display."

**Problem Bullets:**
- Visible limit orders get hunted - "$100k buy at $1.20" is a target
- Market makers manipulate to just miss your order, then reverse
- Large orders signal intent - markets move against you
- Institutions have dark pools. Retail traders are exposed.

**Problem GIF:** Search for "target" or "exposed" or "hunted"

## Solution

**Transformation:** "From hunted target to hidden in the herd"

**Solution Bullets:**
- Orders are hidden - commit without revealing price or size
- ZK proofs verified ON-CHAIN by Sui's native Groth16 module
- Matching happens privately - orders cross when conditions meet
- Atomic execution via DeepBook v3
- Cross-chain deposits via LI.FI

**Solution GIF:** Search for "zebra herd" or "camouflage" or "hidden"

## How It Works

Flow steps:
1. Commit Order (Hidden)
2. Generate ZK Proof
3. On-chain Verification (Sui Groth16)
4. Private Matching
5. Reveal & Settle (DeepBook v3)

## Sponsors & Ecosystem Fit

**Sponsors:** Sui, LI.FI

**Why This Matters:**
- Sui gets a showcase for native Groth16 verification (sui::groth16)
- DeepBook v3 as settlement layer
- LI.FI enables cross-chain deposits to Sui
- Move smart contracts for dark pool logic

## Team

- Gabriel (Full Stack + Smart Contracts)

## Links

- github.com/gabrielantonyxaviour/zebra
- @gabrielaxy
- gabrielaxy.eth

## Tech Stack

Sui Move, Groth16 (Circom + snarkjs), sui::groth16, DeepBook v3, LI.FI Composer, React, TypeScript

---

## Instructions

1. Use `gifgrep` to find appropriate problem/solution GIFs (zebra herd would be perfect for solution)
2. Use `/gemini-image` to generate a logo: "Minimalist app logo: abstract zebra stripes pattern forming a geometric shape suggesting hidden layers or a lock. Pure black and white with sharp contrast. Clean vector style. No text. Square format."
3. Generate the pitch deck following the 8-slide structure
4. Save to: `/Users/gabrielantonyxaviour/Documents/workspaces/ethglobal/decks/zebra_pitch.pptx`
