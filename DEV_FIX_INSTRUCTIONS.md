# MS+SS+CA v2.0 - Dev修复指令

**文档版本**: v1.0  
**更新日期**: 2026-04-04  
**优先级**: P0阻断性问题必须立即修复

---

## 🚨 关键变更说明

**链配置更新**: 根据产品决策，链配置从 Base 链改为 **Ethereum + BSC** 双链支持  
- Ethereum 主网用于正式环境
- BSC 主网用于低成本场景
- BSC Testnet 用于测试环境

---

## 📋 修复任务清单

### 🔴 P0 - 阻断性问题 (必须修复)

#### 任务1: 统一商业逻辑 - 平台费率
**文件**: `apps/ms-web/src/app/campaigns/create/page.tsx`

**问题**: 前端显示平台费5%，与PRD要求的30%不一致

**修改内容**:
```typescript
// 第 ~260 行，修改预算分解计算
// 当前错误代码:
const platformFee = budget * 0.05;  // ❌ 错误: 5%
const caReward = budget * 0.95;

// 改为:
const platformFee = budget * 0.30;  // ✅ 正确: 30%
const caReward = budget * 0.70;     // ✅ 正确: 70%
```

**同时修改显示文本**:
```typescript
// 第 ~270 行
<span className="text-text-secondary">Platform Fee (30%)</span>  // 改为30%
<span className="text-text-secondary">CA Rewards (70%)</span>    // 改为70%
```

**验收标准**: 前端显示的平台费率和后端`utils/pricing.ts`一致 (30%/70%)

---

#### 任务2: 重写合约ABI - 匹配MSCampaignVault.sol
**文件**: `apps/ms-web/src/hooks/useCampaignContract.ts`

**问题**: 前端ABI与合约实际接口完全不匹配

**替换整个文件内容**:

```typescript
'use client';

import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';

// MSCampaignVault合约完整ABI
const MSCAMPAIGN_VAULT_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'id', type: 'bytes32' },
          { name: 'totalBudget', type: 'uint256' },
          { name: 'paymentToken', type: 'address' }
        ],
        name: '_input',
        type: 'tuple'
      }
    ],
    name: 'createCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '_campaignId', type: 'bytes32' }],
    name: 'payCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: '_campaignId', type: 'bytes32' },
      { name: '_cas', type: 'address[]' },
      { name: '_rewards', type: 'uint256[]' }
    ],
    name: 'completeCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '_campaignId', type: 'bytes32' }],
    name: 'cancelCampaign',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: '_campaignId', type: 'bytes32' }],
    name: 'getCampaign',
    outputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'advertiser', type: 'address' },
      { name: 'totalBudget', type: 'uint256' },
      { name: 'platformFee', type: 'uint256' },
      { name: 'rewardPool', type: 'uint256' },
      { name: 'paymentToken', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'completedAt', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_campaignId', type: 'bytes32' }],
    name: 'isCampaignPaid',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'platformFeePercent',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'campaignId', type: 'bytes32' },
      { indexed: true, name: 'advertiser', type: 'address' },
      { name: 'totalBudget', type: 'uint256' }
    ],
    name: 'CampaignPaid',
    type: 'event'
  }
] as const;

// 合约地址 - 需要部署后更新
const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  1: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_ETH as `0x${string}` || '0x0000000000000000000000000000000000000000',     // Ethereum Mainnet
  56: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_BSC as `0x${string}` || '0x0000000000000000000000000000000000000000',    // BSC Mainnet
  97: process.env.NEXT_PUBLIC_CAMPAIGN_VAULT_BSCTEST as `0x${string}` || '0x0000000000000000000000000000000000000000', // BSC Testnet
};

// USDT地址
const USDT_ADDRESSES: Record<number, `0x${string}`> = {
  1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',      // Ethereum USDT
  56: '0x55d398326f99059fF775485246999027B3197955',      // BSC USDT
  97: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',      // BSC Testnet USDT (示例)
};

interface CreateCampaignParams {
  campaignId: string;      // 后端生成的campaign ID (转bytes32)
  totalBudget: string;     // USDT金额 (如 "500" = 500 USDT)
  paymentToken: `0x${string}`;
}

interface UseCampaignContractReturn {
  createCampaign: (params: CreateCampaignParams) => Promise<void>;
  payCampaign: (campaignId: string) => Promise<void>;
  getCampaign: (campaignId: string) => Promise<any>;
  isPaid: (campaignId: string) => Promise<boolean>;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  hash: `0x${string}` | undefined;
}

export function useCampaignContract(chainId: number = 1): UseCampaignContractReturn {
  const { address } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId];
  const usdtAddress = USDT_ADDRESSES[chainId];
  
  const { 
    writeContract, 
    data: hash,
    error,
    isPending,
  } = useWriteContract();

  const { isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // 创建活动 (仅注册，不支付)
  const createCampaign = async ({ campaignId, totalBudget }: CreateCampaignParams) => {
    if (!address) throw new Error('Wallet not connected');
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('Contract not deployed on this chain');
    }

    // 将campaignId转为bytes32
    const campaignIdBytes32 = campaignId.startsWith('0x') 
      ? campaignId as `0x${string}` 
      : `0x${campaignId.padStart(64, '0')}` as `0x${string}`;

    // USDT有6位小数
    const budgetWei = parseUnits(totalBudget, 6);

    writeContract({
      address: contractAddress,
      abi: MSCAMPAIGN_VAULT_ABI,
      functionName: 'createCampaign',
      args: [{
        id: campaignIdBytes32,
        totalBudget: budgetWei,
        paymentToken: usdtAddress
      }],
    });
  };

  // 支付活动 (需要提前approve USDT)
  const payCampaign = async (campaignId: string) => {
    if (!address) throw new Error('Wallet not connected');

    const campaignIdBytes32 = campaignId.startsWith('0x') 
      ? campaignId as `0x${string}` 
      : `0x${campaignId.padStart(64, '0')}` as `0x${string}`;

    writeContract({
      address: contractAddress,
      abi: MSCAMPAIGN_VAULT_ABI,
      functionName: 'payCampaign',
      args: [campaignIdBytes32],
    });
  };

  // 读取活动信息
  const getCampaign = async (campaignId: string) => {
    // 使用useReadContract或直接调用
    // 这里简化处理，实际需要单独hook
    return null;
  };

  // 检查是否已支付
  const isPaid = async (campaignId: string) => {
    return false;
  };

  return {
    createCampaign,
    payCampaign,
    getCampaign,
    isPaid,
    isPending,
    isSuccess,
    error,
    hash,
  };
}

// 新增: USDT Approve Hook
export function useUSDTApprove(chainId: number = 1) {
  const { address } = useAccount();
  const contractAddress = CONTRACT_ADDRESSES[chainId];
  const usdtAddress = USDT_ADDRESSES[chainId];
  
  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = async (amount: string) => {
    if (!address) throw new Error('Wallet not connected');
    
    const amountWei = parseUnits(amount, 6);
    
    writeContract({
      address: usdtAddress,
      abi: [
        {
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          name: 'approve',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'approve',
      args: [contractAddress, amountWei],
    });
  };

  return { approve, hash, error, isPending, isSuccess };
}
```

---

#### 任务3: 更新链配置 - Ethereum + BSC
**文件**: `apps/ms-web/src/providers/Web3Provider.tsx`

**替换chains配置**:
```typescript
// 第4行，修改导入
import { mainnet, bsc, bscTestnet } from 'wagmi/chains';  // 已正确，保持不变

// 第10-15行，修改config中的chains
function createWagmiConfig() {
  return createConfig({
    chains: [mainnet, bsc, bscTestnet],  // ✅ Ethereum + BSC + BSC Testnet
    connectors: [
      injected({ target: 'metaMask' }),
      walletConnect({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project',
        metadata: {
          name: 'MS Marketing Platform',
          description: 'Decentralized Crypto Marketing Crowdsourcing Platform',
          url: 'https://ms.platform.com',
          icons: ['https://ms.platform.com/logo.png'],
        },
      }),
    ],
    transports: {
      [mainnet.id]: { 
        http: () => ({ 
          url: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com' 
        }) 
      },
      [bsc.id]: { 
        http: () => ({ 
          url: process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc-dataseed.binance.org' 
        }) 
      },
      [bscTestnet.id]: { 
        http: () => ({ 
          url: process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545' 
        }) 
      },
    },
  });
}
```

**添加环境变量到 `.env.local`**:
```
# Contract Addresses
NEXT_PUBLIC_CAMPAIGN_VAULT_ETH=0x...
NEXT_PUBLIC_CAMPAIGN_VAULT_BSC=0x...
NEXT_PUBLIC_CAMPAIGN_VAULT_BSCTEST=0x...

# RPC URLs (可选，使用默认值可省略)
NEXT_PUBLIC_ETHEREUM_RPC_URL=https://eth.llamarpc.com
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed.binance.org
NEXT_PUBLIC_BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

---

#### 任务4: 实现支付流程集成
**文件**: `apps/ms-web/src/app/campaigns/create/page.tsx`

**修改handleSubmit函数** (~第80行):

```typescript
import { useCampaignContract, useUSDTApprove } from '@/hooks/useCampaignContract';
import { useChainId } from 'wagmi';

export default function CreateCampaignPage() {
  // ... 现有状态
  const chainId = useChainId();
  const { createCampaign, payCampaign, isPending: isContractPending, isSuccess } = useCampaignContract(chainId);
  const { approve, isSuccess: isApproveSuccess } = useUSDTApprove(chainId);
  const [step, setStep] = useState<'create' | 'approve' | 'pay' | 'done'>('create');

  const handleSubmit = async () => {
    try {
      // Step 1: 调用后端API创建Campaign
      const response = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advertiserId: address,
          advertiserWallet: address,
          skillId: formData.skillId,
          config: {
            duration: formData.duration,
            communityCount: formData.selectedCommunities.length,
            projectInfo: { name: 'Project Name' }, // 从表单获取
            requirements: {
              pinnedPost: true,
              groupAds: 3,
              discussions: 2
            }
          },
          selectedCommunities: formData.selectedCommunities
        })
      });
      
      const { data: campaign, pricing } = await response.json();
      
      // Step 2: 调用合约createCampaign (注册活动)
      setStep('create');
      await createCampaign({
        campaignId: campaign.id,
        totalBudget: formatUnits(BigInt(pricing.total), 6), // 转换为可读格式
        paymentToken: USDT_ADDRESSES[chainId]
      });
      
      // Step 3: 等待createCampaign确认后，approve USDT
      setStep('approve');
      await approve(formatUnits(BigInt(pricing.total), 6));
      
      // Step 4: 调用payCampaign完成支付
      setStep('pay');
      await payCampaign(campaign.id);
      
      // Step 5: 更新后端状态为active
      await fetch(`/api/v1/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' })
      });
      
      setStep('done');
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Campaign creation failed:', error);
      alert('Failed to create campaign: ' + error.message);
    }
  };

  // 在UI中添加步骤指示
  {currentStep === 4 && (
    <StepReview 
      formData={formData} 
      isConnected={isConnected}
      step={step}
      isPending={isContractPending}
    />
  )}
}
```

**修改StepReview组件**显示支付进度:
```typescript
function StepReview({ formData, isConnected, step, isPending }: { 
  formData: any; 
  isConnected: boolean;
  step: string;
  isPending: boolean;
}) {
  const steps = [
    { id: 'create', label: 'Create Campaign', done: step !== 'create' },
    { id: 'approve', label: 'Approve USDT', done: ['pay', 'done'].includes(step) },
    { id: 'pay', label: 'Pay Campaign', done: step === 'done' },
  ];
  
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">Review Campaign</h2>
      
      {/* 原有内容 */}
      
      {/* 添加支付步骤指示 */}
      <div className="mt-6 space-y-2">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className={s.done ? 'text-green-500' : 'text-gray-400'}>
              {s.done ? '✓' : '○'}
            </span>
            <span className={s.done ? 'text-text-primary' : 'text-text-secondary'}>
              {s.label}
            </span>
            {step === s.id && isPending && <span className="text-accent">(pending...)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

#### 任务5: 添加Zod输入验证层
**新建文件**: `apps/ms-api/src/middleware/validation.ts`

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { Errors } from '../utils/errors.js';

// Campaign创建验证
export const CreateCampaignSchema = z.object({
  advertiserId: z.string().min(1, 'Advertiser ID is required'),
  advertiserWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  skillId: z.string().min(1, 'Skill ID is required'),
  config: z.object({
    duration: z.enum(['1d', '1w', '1m']),
    communityCount: z.number().int().min(1).max(50),
    projectInfo: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(1000).optional(),
      website: z.string().url().optional(),
      twitter: z.string().optional(),
    }),
    requirements: z.object({
      pinnedPost: z.boolean().default(true),
      groupAds: z.number().int().min(0).max(10).default(3),
      discussions: z.number().int().min(0).max(10).default(2),
    }).optional(),
  }),
  selectedCommunities: z.array(z.string().uuid()).min(1, 'At least one community required'),
});

// Offer操作验证
export const OfferActionSchema = z.object({
  caId: z.string().min(1, 'CA ID is required'),
  reason: z.string().max(500).optional(),
});

// Execution报告验证
export const ExecutionReportSchema = z.object({
  pinnedPost: z.object({
    messageId: z.string(),
    messageUrl: z.string().url(),
  }).optional(),
  groupAds: z.array(z.object({
    messageId: z.string(),
    content: z.string(),
  })).optional(),
  discussions: z.array(z.object({
    topic: z.string(),
    messageId: z.string(),
  })).optional(),
  status: z.enum(['executing', 'completed']).optional(),
});

// 验证中间件工厂
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const errors = result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        throw Errors.VALIDATION('Validation failed', { errors });
      }
      
      // 将验证后的数据附加到请求
      req.body = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// 查询参数验证
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      
      if (!result.success) {
        const errors = result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        throw Errors.VALIDATION('Query validation failed', { errors });
      }
      
      req.query = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

**在路由中应用验证** (示例):
```typescript
// apps/ms-api/src/routes/campaigns.ts
import { validate, CreateCampaignSchema } from '../middleware/validation.js';

router.post('/', validate(CreateCampaignSchema), async (req, res) => {
  // req.body 已经通过验证
  // ...
});
```

**安装依赖**:
```bash
cd apps/ms-api
pnpm add zod
```

---

### 🟡 P1 - 高优先级修复

#### 任务6: 添加API限流
**新建文件**: `apps/ms-api/src/middleware/rateLimit.ts`

```typescript
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// 通用限流: 100请求/15分钟
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 严格限流: 10请求/分钟 (用于敏感操作)
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests, please slow down'
    }
  },
});

// 合约操作限流: 5请求/分钟
export const contractLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Contract operations limited, please wait'
    }
  },
});
```

**在index.ts中应用**:
```typescript
import { generalLimiter, strictLimiter } from './middleware/rateLimit.js';

app.use(generalLimiter);
app.use('/api/v1/campaigns', strictLimiter);
```

---

#### 任务7: CA Bot连接真实API
**文件**: `apps/ca-bot/src/bot.ts` 和相关handlers

**修改 /earnings 命令**:
```typescript
import { fetchEarnings } from './services/msApi.js';

bot.command('earnings', async (ctx) => {
  try {
    const earnings = await fetchEarnings();
    
    await ctx.reply(
      '💰 Your Earnings\n\n' +
      `Total Earned: ${formatAmount(earnings.totalEarned)} USDT\n` +
      `Pending: ${formatAmount(earnings.pending)} USDT\n` +
      `This Month: ${formatAmount(earnings.thisMonth)} USDT\n\n` +
      'Visit https://ms.platform.com/ca/earnings for details'
    );
  } catch (error) {
    await ctx.reply('❌ Error fetching earnings. Please try again.');
  }
});
```

**修改 /tasks 命令**:
```typescript
bot.command('tasks', async (ctx) => {
  try {
    const executions = await fetchExecutions({ status: 'executing' });
    
    if (executions.length === 0) {
      await ctx.reply(
        '📋 Your Active Tasks\n\n' +
        'No active tasks currently.\n' +
        'Use /offers to find new opportunities.'
      );
      return;
    }
    
    let message = '📋 Your Active Tasks\n\n';
    for (const task of executions) {
      message += `• ${task.campaignName}\n`;
      message += `  Deadline: ${new Date(task.deadline).toLocaleDateString()}\n`;
      message += `  Progress: ${task.progress}%\n\n`;
    }
    
    await ctx.reply(message);
  } catch (error) {
    await ctx.reply('❌ Error fetching tasks.');
  }
});
```

**在msApi.ts中添加**:
```typescript
export async function fetchEarnings() {
  try {
    const response = await msApi.get(`/ca/v1/earnings?caId=${CA_BOT_ID}`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching earnings:', error);
    return { totalEarned: '0', pending: '0', thisMonth: '0' };
  }
}

export async function fetchExecutions(params: { status?: string } = {}) {
  try {
    const query = new URLSearchParams({ caId: CA_BOT_ID });
    if (params.status) query.append('status', params.status);
    
    const response = await msApi.get(`/ca/v1/executions?${query}`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching executions:', error);
    return [];
  }
}
```

---

#### 任务8: CA Bot执行上报
**文件**: `apps/ca-bot/src/handlers/shilling.ts`

**修改pin命令，添加上报**:
```typescript
import { reportExecution } from '../services/msApi.js';

bot.command('pin', async (ctx) => {
  try {
    // ... 现有代码 ...
    
    const sentMessage = await ctx.reply(messageText);
    await ctx.pinChatMessage(sentMessage.message_id);
    
    // 获取当前执行的executionId (需要从会话状态或数据库获取)
    const executionId = await getCurrentExecution(ctx.chat?.id);
    
    if (executionId) {
      await reportExecution(executionId, {
        pinnedPost: {
          messageId: sentMessage.message_id.toString(),
          messageUrl: `https://t.me/c/${ctx.chat?.id}/${sentMessage.message_id}`
        }
      });
      await ctx.reply('✅ Message pinned and reported to MS!');
    } else {
      await ctx.reply('✅ Message pinned successfully!');
    }
    
  } catch (error) {
    // ... 错误处理 ...
  }
});
```

**类似修改 /ad 和 /discuss 命令**。

---

#### 任务9: 完善Campaign状态机
**文件**: `apps/ms-api/src/services/campaignState.ts` (新建)

```typescript
import { prisma } from '@ms/database';

export const CampaignStateMachine = {
  // 允许的状态转换
  transitions: {
    draft: ['pending', 'cancelled'],
    pending: ['active', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },

  async canTransition(from: string, to: string): Promise<boolean> {
    return this.transitions[from]?.includes(to) || false;
  },

  async transition(campaignId: string, toStatus: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true }
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const canTransition = await this.canTransition(campaign.status, toStatus);
    if (!canTransition) {
      throw new Error(`Cannot transition from ${campaign.status} to ${toStatus}`);
    }

    return prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        status: toStatus,
        timeline: {
          update: {
            [`${toStatus}At`]: new Date().toISOString()
          }
        }
      }
    });
  }
};
```

---

### 🟢 P2 - 优化项

#### 任务10: 添加合约部署脚本
**文件**: `packages/contracts/hardhat.config.ts`

```typescript
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.8.19',
  networks: {
    hardhat: {
      forking: {
        url: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      }
    },
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bsc: {
      url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      bscTestnet: process.env.BSCSCAN_API_KEY || '',
    },
  },
};

export default config;
```

---

#### 任务11: 添加单元测试
**新建目录**: `apps/ms-api/src/services/__tests__/`

**文件**: `shillingEngine.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateShillingExecution } from '../shillingEngine';

describe('ShillingEngine', () => {
  describe('validateShillingExecution', () => {
    it('should return valid for complete execution', () => {
      const data = {
        pinnedPost: { messageId: '123' },
        groupAds: [{ messageId: '1' }, { messageId: '2' }, { messageId: '3' }],
        discussions: [{ topic: 'test', messageId: 'd1' }, { topic: 'test2', messageId: 'd2' }]
      };
      
      const requirements = { pinnedPost: true, groupAds: 3, discussions: 2 };
      
      const result = validateShillingExecution(data, requirements);
      
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });
    
    it('should return invalid for incomplete execution', () => {
      const data = { pinnedPost: null, groupAds: [], discussions: [] };
      const requirements = { pinnedPost: true, groupAds: 3, discussions: 2 };
      
      const result = validateShillingExecution(data, requirements);
      
      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });
});
```

---

## 📦 依赖安装清单

```bash
# MS API
cd apps/ms-api
pnpm add zod express-rate-limit ioredis
pnpm add -D vitest @types/express-rate-limit

# MS Web (已有wagmi/viem，确认版本)
cd apps/ms-web
pnpm add viem@latest

# CA Bot
cd apps/ca-bot
pnpm add axios

# Contracts
cd packages/contracts
pnpm add -D @nomicfoundation/hardhat-toolbox
```

---

## ✅ 验收检查清单

### 部署前必须检查

- [ ] 所有P0任务已完成
- [ ] 合约已在BSC Testnet部署并测试
- [ ] 前端费率显示30%/70%
- [ ] 支付流程端到端测试通过
- [ ] Zod验证阻止无效请求
- [ ] CA Bot能获取真实数据

### 测试场景

1. **完整流程测试**:
   - 创建Campaign → 合约注册 → Approve USDT → Pay → 状态变为active

2. **CA执行任务**:
   - CA接受offer → pin消息 → 上报执行 → SS验证通过 → 标记完成

3. **错误处理**:
   - 无效输入被Zod拦截
   - 频繁请求被限流
   - 合约调用失败有清晰错误

---

**预计工作量**: 
- P0任务: 2-3天
- P1任务: 1-2天
- P2任务: 2-3天

**建议**: 先完成P0上线MVP，P1/P2后续迭代。
