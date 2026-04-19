import { z } from 'zod';

// Campaign creation form validation
export const campaignFormSchema = z.object({
  objective: z.enum(['awareness', 'engagement', 'conversion', 'launch'], {
    required_error: 'Please select a campaign objective',
    invalid_type_error: 'Invalid campaign objective',
  }),
  skillId: z.enum(['shilling-skill'], {
    required_error: 'Please select a shilling skill',
    invalid_type_error: 'Invalid skill selection',
  }),
  selectedCommunities: z.array(z.string()).min(1, {
    message: 'Please select at least one community',
  }),
  duration: z.number().int().min(1).max(30, {
    message: 'Duration must be between 1 and 30 days',
  }),
  budget: z.number().min(0.5).max(50000, {
    message: 'Budget must be between $0.5 and $50,000',
  }),
  targetUrl: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
});

export type CampaignFormData = z.infer<typeof campaignFormSchema>;

// Campaign creation contract params validation
export const campaignContractSchema = z.object({
  campaignId: z.string().min(1, {
    message: 'Campaign ID is required',
  }),
  totalBudget: z.string().regex(/^\d+$/, {
    message: 'Total budget must be a valid integer (USDT units)',
  }),
  paymentToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/i, {
    message: 'Invalid Ethereum address format',
  }),
});

export type CampaignContractParams = z.infer<typeof campaignContractSchema>;

// Chain ID validation
export const supportedChainIds = [1, 56, 97] as const; // ETH, BSC, BSC Testnet
export const chainIdSchema = z.number().refine(
  (val) => supportedChainIds.includes(val as typeof supportedChainIds[number]),
  { message: 'Unsupported chain ID' }
);

// Environment variables validation
export const envSchema = z.object({
  NEXT_PUBLIC_CAMPAIGN_VAULT_ETH: z.string().regex(/^0x[a-fA-F0-9]{40}$/i).optional(),
  NEXT_PUBLIC_CAMPAIGN_VAULT_BSC: z.string().regex(/^0x[a-fA-F0-9]{40}$/i).optional(),
  NEXT_PUBLIC_CAMPAIGN_VAULT_BSCTEST: z.string().regex(/^0x[a-fA-F0-9]{40}$/i).optional(),
  NEXT_PUBLIC_ETHEREUM_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_BSC_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_BSC_TESTNET_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Helper function to validate form data
export function validateCampaignForm(data: unknown): { success: true; data: CampaignFormData } | { success: false; errors: string[] } {
  const result = campaignFormSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((err) => err.message);
  return { success: false, errors };
}

// Helper function to validate contract params
export function validateContractParams(data: unknown): { success: true; data: CampaignContractParams } | { success: false; errors: string[] } {
  const result = campaignContractSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((err) => err.message);
  return { success: false, errors };
}
