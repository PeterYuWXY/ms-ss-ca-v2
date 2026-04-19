# MSCampaignVault Contract Addresses

## BSC Testnet (Chain ID: 97)
- MSCampaignVault: `0xD00914d5EE3C426a97CcFBE7a79DAFC5aCB789F4`
- MockUSDT: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`

## Local Development
- Run `npm run deploy:local` to deploy to local Hardhat network

## Deployment Commands
```bash
# Local
npx hardhat run scripts/deploy.js --network hardhat

# BSC Testnet
npx hardhat run scripts/deploy.js --network bscTestnet

# BSC Mainnet
npx hardhat run scripts/deploy.js --network bsc
```
