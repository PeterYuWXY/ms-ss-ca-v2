export const MSCampaignVaultABI = [
  {
    inputs: [
      { internalType: 'address', name: '_usdt', type: 'address' },
      { internalType: 'address', name: '_platformVault', type: 'address' }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'createCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'payCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'completeCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'cancelCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'campaignId', type: 'string' }],
    name: 'getCampaign',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'advertiser', type: 'address' },
          { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'platformFee', type: 'uint256' },
          { internalType: 'uint256', name: 'caReward', type: 'uint256' },
          { internalType: 'uint8', name: 'status', type: 'uint8' }
        ],
        internalType: 'struct MSCampaignVault.Campaign',
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'campaignId', type: 'string' },
      { indexed: false, internalType: 'address', name: 'advertiser', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'CampaignCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'string', name: 'campaignId', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'CampaignPaid',
    type: 'event'
  }
] as const;

export const ERC20ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;
