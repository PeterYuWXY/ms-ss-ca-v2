import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    // Ethereum Mainnet
    ethereum: {
      url: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    // Ethereum Sepolia Testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // BSC Mainnet
    bsc: {
      url: process.env.BSC_RPC || 'https://bsc-dataseed.binance.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
    },
    // BSC Testnet
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 97,
    },
    // Base
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: process.env.BASE_RPC || 'https://mainnet.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      ethereum: process.env.ETHERSCAN_API_KEY || '',
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      bscTestnet: process.env.BSCSCAN_API_KEY || '',
      baseSepolia: process.env.BASESCAN_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'sepolia',
        chainId: 11155111,
        urls: {
          apiURL: 'https://api-sepolia.etherscan.io/api',
          browserURL: 'https://sepolia.etherscan.io',
        },
      },
      {
        network: 'bsc',
        chainId: 56,
        urls: {
          apiURL: 'https://api.bscscan.com/api',
          browserURL: 'https://bscscan.com',
        },
      },
      {
        network: 'bscTestnet',
        chainId: 97,
        urls: {
          apiURL: 'https://api-testnet.bscscan.com/api',
          browserURL: 'https://testnet.bscscan.com',
        },
      },
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
