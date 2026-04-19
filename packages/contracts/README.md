# @ms/contracts

Smart contracts for MS+SS+CA Platform

## Overview

MSCampaignVault is a multi-chain campaign escrow contract supporting:
- **Ethereum** (Mainnet & Sepolia)
- **BSC** (Mainnet & Testnet)
- **Base** (Mainnet & Sepolia)

## Features

- ✅ Campaign creation and payment escrow
- ✅ 30% platform fee / 70% CA reward pool
- ✅ Multi-chain deployment support
- ✅ OpenZeppelin security standards
- ✅ Reentrancy protection

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your PRIVATE_KEY and TREASURY_ADDRESS

# Compile contracts
npm run compile

# Run tests
npm run test
```

## Deployment

### Local Testing
```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

### Testnet Deployment

**Ethereum Sepolia:**
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

**BSC Testnet:**
```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

**Base Sepolia:**
```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

### Mainnet Deployment

**Ethereum:**
```bash
npx hardhat run scripts/deploy.ts --network ethereum
```

**BSC:**
```bash
npx hardhat run scripts/deploy.ts --network bsc
```

**Base:**
```bash
npx hardhat run scripts/deploy.ts --network base
```

## Contract Verification

After deployment, verify the contract:

```bash
npx hardhat verify --network <network> <DEPLOYED_ADDRESS> <TREASURY_ADDRESS>
```

Example:
```bash
npx hardhat verify --network base 0x... 0x...
```

## Contract Architecture

### MSCampaignVault

**Core Functions:**
- `createCampaign()` - Create a new campaign
- `payCampaign()` - Pay and activate campaign
- `completeCampaign()` - Complete and distribute rewards
- `cancelCampaign()` - Cancel and refund

**Admin Functions:**
- `setPlatformFeePercent()` - Update fee (max 50%)
- `setTreasury()` - Update treasury address
- `setTokenSupport()` - Add/remove supported tokens
- `withdrawPlatformFees()` - Withdraw accumulated fees

**View Functions:**
- `getCampaign()` - Get campaign details
- `getCAReward()` - Get CA reward amount
- `getCampaignCAs()` - Get list of CAs for campaign
- `isCampaignPaid()` - Check if campaign is paid

## Supported Tokens

### Ethereum
- USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- WETH: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`

### BSC
- USDT: `0x55d398326f99059fF775485246999027B3197955`
- USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`
- WBNB: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`

### Base
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- WETH: `0x4200000000000000000000000000000000000006`

## License

MIT
