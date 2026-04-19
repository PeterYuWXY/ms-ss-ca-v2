'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { Header } from '@/components/Header';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useCampaignContract } from '@/hooks/useCampaignContract';
import { validateCampaignForm, type CampaignFormData } from '@/lib/validation';
import { mainnet, bsc, bscTestnet } from 'wagmi/chains';
import { parseUnits, type Address } from 'viem';
import {
  calculatePricing, calculateDisplayPricing, formatAmount,
  PACKAGE_DURATION, PACKAGE_REQUIREMENTS,
  type PromotionPackage,
} from '@ms/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

const STEPS = [
  { id: 'content',     title: 'Promote Content',    description: 'What to promote' },
  { id: 'objective',   title: 'Campaign Objective',  description: 'Define your goals' },
  { id: 'skill',       title: 'Shilling Skill',      description: 'Select promotion type' },
  { id: 'communities', title: 'Communities',          description: 'Choose target communities' },
  { id: 'schedule',    title: 'Schedule & Budget',   description: 'Set timing and pricing' },
  { id: 'review',      title: 'Review & Pay',        description: 'Confirm and deploy' },
];

const SUPPORTED_CHAINS = [mainnet, bsc, bscTestnet];
const USDT_DECIMALS = 6;

const DURATION_OPTIONS = [
  { value: '1w', label: '1 Week',  days: 7  },
  { value: '2w', label: '2 Weeks', days: 14 },
  { value: '4w', label: '4 Weeks', days: 28 },
] as const;

const COMMUNITY_OPTIONS = [10, 30, 50] as const;

type DurationKey = '1w' | '2w' | '4w';
type CommunityCount = 10 | 30 | 50;

const PACKAGE_OPTIONS: {
  value: PromotionPackage;
  label: string;
  tagline: string;
  details: string[];
}[] = [
  {
    value: 'A',
    label: 'Package A',
    tagline: '3 posts + 3 discussions · 1 week',
    details: ['3 ad posts in group', '3+ discussion interactions', '1-week campaign'],
  },
  {
    value: 'B',
    label: 'Package B',
    tagline: '48h sticky + 3 posts + 3 discussions · 1 week',
    details: ['48-hour pinned post', '3 ad posts in group', '3+ discussion interactions', '1-week campaign'],
  },
  {
    value: 'C',
    label: 'Package C',
    tagline: '96h sticky + 6 posts + 6 discussions · 2 weeks',
    details: ['96-hour pinned post', '6 ad posts in group', '6+ discussion interactions', '2-week campaign'],
  },
  {
    value: 'D',
    label: 'Package D',
    tagline: '192h sticky + 12 posts + 12 discussions · 4 weeks',
    details: ['192-hour pinned post', '12 ad posts in group', '12+ discussion interactions', '4-week campaign'],
  },
];

type PromoteContent = {
  contentUrl: string;
  adCopy: string;
  landingUrl: string;
};

type FormDataState = {
  promoteContent: PromoteContent;
  objectives: string[];
  skillId: string;
  filterTags: string[];
  filterLanguages: string[];
  duration: DurationKey;
  communityCount: CommunityCount;
  promotionPackage: PromotionPackage;
};

export default function CreateCampaignPageInner() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormDataState>({
    promoteContent: { contentUrl: '', adCopy: '', landingUrl: '' },
    objectives: [],
    skillId: '',
    filterTags: [],
    filterLanguages: [],
    duration: '1w',
    communityCount: 10,
    promotionPackage: 'A',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'creating' | 'approving' | 'paying' | 'confirming' | 'confirmed' | 'failed'>('idle');

  const router = useRouter();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { createCampaign, payCampaign, approveUSDT, isPending, isSuccess, error, hash } = useCampaignContract();

  const getUSDTAddress = (chainId: number): Address => {
    const addresses: Record<number, Address> = {
      [mainnet.id]:    '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      [bsc.id]:        '0x55d398326f99059fF775485246999027B3197955',
      [bscTestnet.id]: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    };
    return addresses[chainId] || '0x0000000000000000000000000000000000000000';
  };

  // Test-mode on-chain payment amounts (small USDT for local/testnet testing)
  const testPricing = calculatePricing(formData.duration, formData.communityCount);

  // Production display pricing shown in the UI (not used for actual payment)
  const displayPricing = calculateDisplayPricing(formData.promotionPackage, formData.communityCount);

  // Aliases used by the payment flow (on-chain amounts)
  const pricing    = testPricing;
  const totalBudget = Number(formatAmount(testPricing.total,       USDT_DECIMALS));
  const platformFee = Number(formatAmount(testPricing.platformFee, USDT_DECIMALS));
  const caReward    = Number(formatAmount(testPricing.caReward,    USDT_DECIMALS));

  useEffect(() => {
    if (isSuccess && hash && campaignId && paymentStatus !== 'confirmed') {
      setPaymentStatus('confirming');
      setTxHash(hash);
      fetch(`${API_BASE}/api/v1/campaigns/${campaignId}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash }),
      })
        .then(() => setPaymentStatus('confirmed'))
        .catch(() => setPaymentStatus('failed'));
    }
  }, [isSuccess, hash, campaignId, paymentStatus]);

  useEffect(() => {
    if (paymentStatus === 'confirmed' && campaignId) {
      router.push(`/dashboard?campaign=created&id=${campaignId}`);
    }
  }, [paymentStatus, campaignId, router]);

  const validateCurrentStep = (): boolean => {
    setErrors([]);
    switch (currentStep) {
      case 0:
        if (!formData.promoteContent.adCopy.trim()) { setErrors(['Please enter the ad copy']); return false; }
        return true;
      case 1:
        if (formData.objectives.length === 0) { setErrors(['Please select at least one campaign objective']); return false; }
        return true;
      case 2:
        if (!formData.skillId) { setErrors(['Please select a shilling skill']); return false; }
        return true;
      case 3:
        // Filters are optional — system will match by score if no filters are set
        return true;
      case 5: {
        const fullData: CampaignFormData = {
          objective: (formData.objectives[0] ?? 'awareness') as CampaignFormData['objective'],
          skillId: formData.skillId as CampaignFormData['skillId'],
          selectedCommunities: [],
          duration: DURATION_OPTIONS.find(d => d.value === formData.duration)?.days || 7,
          budget: totalBudget,
        };
        const result = validateCampaignForm(fullData);
        if (!result.success) { setErrors(result.errors); return false; }
        return true;
      }
      default: return true;
    }
  };

  const handlePackageChange = (pkg: PromotionPackage) => {
    setFormData((prev) => ({
      ...prev,
      promotionPackage: pkg,
      duration: PACKAGE_DURATION[pkg], // auto-lock duration to package's required duration
    }));
  };

  const handleNext = () => { if (validateCurrentStep() && currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 0) { setCurrentStep(currentStep - 1); setErrors([]); } };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    if (!address) { setErrors(['Please connect your wallet']); return; }
    setIsSubmitting(true);
    setErrors([]);
    setPaymentStatus('idle');

    try {
      if (!SUPPORTED_CHAINS.some((c) => c.id === chainId)) {
        setErrors(['Please switch to a supported chain (Ethereum, BSC, or BSC Testnet)']);
        setIsSubmitting(false);
        return;
      }

      const newCampaignId = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setCampaignId(newCampaignId);

      const createResponse = await fetch(`${API_BASE}/api/v1/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: newCampaignId,
          advertiser: address,
          objective: formData.objectives.join(', '),
          skillId: formData.skillId,
          filterTags: formData.filterTags,
          filterLanguages: formData.filterLanguages,
          duration: DURATION_OPTIONS.find(d => d.value === formData.duration)?.days,
          durationKey: formData.duration,
          communityCount: formData.communityCount,
          promotionPackage: formData.promotionPackage,
          budget: totalBudget,
          totalAmount: pricing.total,
          chainId,
          platformFee: pricing.platformFee,
          caReward: pricing.caReward,
          config: {
            objective: formData.objectives,
            duration: DURATION_OPTIONS.find(d => d.value === formData.duration)?.days,
            durationKey: formData.duration,
            communityCount: formData.communityCount,
            targetCommunityCount: formData.communityCount,
            promotionPackage: formData.promotionPackage,
            packageRequirements: PACKAGE_REQUIREMENTS[formData.promotionPackage],
            filterTags: formData.filterTags,
            filterLanguages: formData.filterLanguages,
            budget: totalBudget,
            chainId,
            promoteContent: formData.promoteContent,
          },
        }),
      });

      if (!createResponse.ok) {
        const e = await createResponse.json();
        throw new Error(e.error || 'Failed to create campaign');
      }

      setPaymentStatus('creating');
      const totalAmountBigInt = BigInt(pricing.total);
      const caRewardBigInt    = BigInt(pricing.caReward);

      // Community matching happens server-side after payment confirmation.
      // For the on-chain call we use the advertiser's address as the single
      // CA wallet placeholder — actual per-community payouts are handled by
      // the vault settlement flow once executions complete.
      const caWallets: Address[] = [address];
      const caAmounts: bigint[]  = [caRewardBigInt];

      await createCampaign({ campaignId: newCampaignId, advertiser: address, totalAmount: totalAmountBigInt, caWallets, caAmounts });
      setPaymentStatus('approving');
      await approveUSDT(totalAmountBigInt);
      setPaymentStatus('paying');
      await payCampaign(newCampaignId);

    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Transaction failed. Please try again.']);
      setPaymentStatus('failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getChainName = (id: number) => {
    switch (id) {
      case mainnet.id:    return 'Ethereum';
      case bsc.id:        return 'BSC';
      case bscTestnet.id: return 'BSC Testnet';
      default:            return `Chain ${id}`;
    }
  };

  const getExplorerUrl = (txHash: string) => {
    if (chainId === bscTestnet.id) return `https://testnet.bscscan.com/tx/${txHash}`;
    if (chainId === bsc.id)        return `https://bscscan.com/tx/${txHash}`;
    return `https://etherscan.io/tx/${txHash}`;
  };

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-text-primary mb-8">Create Campaign</h1>

        {isConnected && !SUPPORTED_CHAINS.some((c) => c.id === chainId) && (
          <div className="mb-6 p-4 bg-accent/10 border border-accent rounded-lg">
            <p className="text-accent text-sm mb-2">⚠️ You are on {getChainName(chainId)}. Please switch to a supported chain.</p>
            <div className="flex gap-2 flex-wrap">
              {SUPPORTED_CHAINS.map((chain) => (
                <button key={chain.id} onClick={() => switchChain?.({ chainId: chain.id })}
                  className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary-dark">
                  Switch to {chain.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
            {errors.map((e, i) => <p key={i} className="text-red-500 text-sm">{e}</p>)}
          </div>
        )}

        {/* Step indicator */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center min-w-max">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm shrink-0 ${index <= currentStep ? 'bg-primary text-white' : 'bg-background-tertiary text-text-secondary'}`}>
                  {index + 1}
                </div>
                <div className="ml-2 mr-1 hidden sm:block">
                  <p className={`text-xs font-medium whitespace-nowrap ${index <= currentStep ? 'text-text-primary' : 'text-text-secondary'}`}>{step.title}</p>
                </div>
                {index < STEPS.length - 1 && <div className={`w-8 h-0.5 mx-2 shrink-0 ${index < currentStep ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-background-secondary rounded-lg p-6 border border-border">
          {currentStep === 0 && (
            <StepPromoteContent
              value={formData.promoteContent}
              onChange={(v) => setFormData({ ...formData, promoteContent: v })}
            />
          )}
          {currentStep === 1 && (
            <StepObjective
              values={formData.objectives}
              onChange={(v) => setFormData({ ...formData, objectives: v })}
            />
          )}
          {currentStep === 2 && (
            <StepSkill
              value={formData.skillId}
              onChange={(v) => setFormData({ ...formData, skillId: v })}
            />
          )}
          {currentStep === 3 && (
            <StepCommunities
              filterTags={formData.filterTags}
              filterLanguages={formData.filterLanguages}
              communityCount={formData.communityCount}
              onTagsChange={(v) => setFormData({ ...formData, filterTags: v })}
              onLanguagesChange={(v) => setFormData({ ...formData, filterLanguages: v })}
            />
          )}
          {currentStep === 4 && (
            <StepSchedule
              duration={formData.duration}
              communityCount={formData.communityCount}
              promotionPackage={formData.promotionPackage}
              onPackageChange={handlePackageChange}
              onCommunityCountChange={(c) => setFormData({ ...formData, communityCount: c })}
              displayPricing={displayPricing}
            />
          )}
          {currentStep === 5 && (
            <StepReview
              formData={formData}
              displayPricing={displayPricing}
              isConnected={isConnected}
              isSubmitting={isSubmitting}
              txHash={txHash}
              chainId={chainId}
              chainName={getChainName(chainId)}
              walletAddress={address}
              paymentStatus={paymentStatus}
            />
          )}
        </div>

        <div className="flex justify-between mt-8">
          <button onClick={handleBack} disabled={currentStep === 0 || isSubmitting}
            className="px-6 py-3 bg-background-tertiary hover:bg-border rounded-lg font-medium disabled:opacity-50">
            Back
          </button>
          {currentStep < STEPS.length - 1 ? (
            <button onClick={handleNext}
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium">
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isConnected || isSubmitting || isPending || !SUPPORTED_CHAINS.some((c) => c.id === chainId)}
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2">
              {isPending || isSubmitting
                ? <><span className="animate-spin">⏳</span>{isPending ? 'Confirm in Wallet...' : 'Processing...'}</>
                : !isConnected ? 'Connect Wallet to Continue' : 'Pay & Create Campaign'}
            </button>
          )}
        </div>

        {(isPending || isSuccess || error || paymentStatus !== 'idle') && (
          <div className={`mt-6 p-4 rounded-lg border ${paymentStatus === 'confirmed' || isSuccess ? 'bg-green-500/10 border-green-500' : error || paymentStatus === 'failed' ? 'bg-red-500/10 border-red-500' : 'bg-blue-500/10 border-blue-500'}`}>
            {paymentStatus === 'approving'  && <p className="text-blue-500 text-sm">⏳ Waiting for USDT approval...</p>}
            {paymentStatus === 'paying'     && <p className="text-blue-500 text-sm">⏳ Waiting for payment confirmation...</p>}
            {paymentStatus === 'confirming' && <p className="text-blue-500 text-sm">⏳ Confirming payment on-chain...</p>}
            {paymentStatus === 'confirmed'  && <p className="text-green-500 text-sm">✅ Payment confirmed! Redirecting...</p>}
            {(isSuccess || paymentStatus === 'confirmed') && <p className="text-green-500 text-sm">✅ Payment successful! Redirecting...</p>}
            {error && <p className="text-red-500 text-sm">❌ {error.message}</p>}
            {paymentStatus === 'failed' && <p className="text-red-500 text-sm">❌ Payment failed. Please try again.</p>}
            {hash && <a href={getExplorerUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline mt-2 block">View on Explorer →</a>}
          </div>
        )}
      </main>
    </div>
  );
}

// ==================== Step 1: Promote Content ====================

function StepPromoteContent({ value, onChange }: { value: PromoteContent; onChange: (v: PromoteContent) => void }) {
  const AD_COPY_MAX = 200;
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-text-primary">Promote Content</h2>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Content URL <span className="text-text-secondary font-normal">(article, tweet, announcement, etc.)</span>
        </label>
        <input
          type="url"
          placeholder="https://yourproject.com/announcement"
          value={value.contentUrl}
          onChange={(e) => onChange({ ...value, contentUrl: e.target.value })}
          className="w-full px-4 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary text-sm"
        />
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-text-primary">
            Ad Copy <span className="text-red-500">*</span>
          </label>
          <span className={`text-xs ${value.adCopy.length > AD_COPY_MAX ? 'text-red-500' : 'text-text-secondary'}`}>
            {value.adCopy.length}/{AD_COPY_MAX}
          </span>
        </div>
        <textarea
          rows={5}
          maxLength={AD_COPY_MAX}
          placeholder="Write the promotional message that CA Bots will post in their communities. Keep it engaging and on-brand. Max 200 characters."
          value={value.adCopy}
          onChange={(e) => onChange({ ...value, adCopy: e.target.value })}
          className="w-full px-4 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary text-sm resize-none"
        />
        <p className="text-xs text-text-secondary mt-1">This exact text will be used by CA Bots when posting your campaign in Telegram groups.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Landing Page URL <span className="text-text-secondary font-normal">(for UTM conversion tracking)</span>
        </label>
        <input
          type="url"
          placeholder="https://yourproject.com/landing"
          value={value.landingUrl}
          onChange={(e) => onChange({ ...value, landingUrl: e.target.value })}
          className="w-full px-4 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary text-sm"
        />
        <p className="text-xs text-text-secondary mt-1">CA Bots will append UTM parameters to this URL in every ad post so you can track conversions.</p>
      </div>
    </div>
  );
}

// ==================== Step 2: Campaign Objective (multi-select) ====================

function StepObjective({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const objectives = [
    { id: 'awareness',   label: 'Brand Awareness',       desc: 'Increase visibility and recognition' },
    { id: 'engagement',  label: 'Community Engagement',  desc: 'Drive interactions and discussions' },
    { id: 'conversion',  label: 'Conversion & Sales',    desc: 'Generate leads and conversions' },
    { id: 'launch',      label: 'Product Launch',        desc: 'Announce new product or feature' },
  ];

  const toggle = (id: string) => {
    if (values.includes(id)) onChange(values.filter((v) => v !== id));
    else onChange([...values, id]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Select Campaign Objective</h2>
        <p className="text-sm text-text-secondary mb-4">You can select multiple objectives.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {objectives.map((obj) => {
          const selected = values.includes(obj.id);
          return (
            <button key={obj.id} onClick={() => toggle(obj.id)}
              className={`p-4 rounded-lg border text-left transition-all ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-text-primary">{obj.label}</p>
                  <p className="text-sm text-text-secondary mt-1">{obj.desc}</p>
                </div>
                {selected && <span className="text-primary ml-2 shrink-0">✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Step 3: Shilling Skill ====================

function StepSkill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">Select Shilling Skill</h2>
      <p className="text-xs text-text-secondary mb-5">
        v1.0 has 1 skill available. More marketing skills will be launched in v2.0.
      </p>
      <div className="space-y-3">
        {/* Active skill */}
        <button
          onClick={() => onChange('shilling-skill')}
          className={`w-full p-4 rounded-lg border text-left transition-all ${value === 'shilling-skill' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-text-primary">Skill — Telegram Group Promotion</p>
              <p className="text-sm text-text-secondary mt-0.5">Pinned post + ad broadcasts in Telegram communities</p>
            </div>
            {value === 'shilling-skill' && <span className="text-primary ml-2 shrink-0">✓</span>}
          </div>
        </button>

        {/* Coming soon — non-clickable */}
        <div className="w-full p-4 rounded-lg border border-border/50 opacity-50 cursor-not-allowed select-none">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-text-secondary">Skill — X KOL Promotion</p>
              <p className="text-sm text-text-secondary mt-0.5">KOL tweet & thread campaigns on X (Twitter)</p>
            </div>
            <span className="text-xs bg-background-tertiary text-text-secondary px-2 py-1 rounded-full border border-border ml-2 shrink-0">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Step 4: Community Target Filters ====================

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English'    },
  { value: 'zh', label: 'Chinese'    },
  { value: 'ko', label: 'Korean'     },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ru', label: 'Russian'    },
  { value: 'es', label: 'Spanish'    },
  { value: 'ja', label: 'Japanese'   },
  { value: 'tr', label: 'Turkish'    },
];

const TOPIC_TAGS = ['RWA', 'Trading', 'DeFi', 'Prediction', 'Alpha', 'NFT', 'GameFi', 'Layer2', 'AI', 'Meme'];

function StepCommunities({
  filterTags, filterLanguages, communityCount, onTagsChange, onLanguagesChange,
}: {
  filterTags: string[];
  filterLanguages: string[];
  communityCount: number;
  onTagsChange: (v: string[]) => void;
  onLanguagesChange: (v: string[]) => void;
}) {
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  const toggleTag  = (t: string) => onTagsChange(filterTags.includes(t)           ? filterTags.filter(x => x !== t)      : [...filterTags, t]);
  const toggleLang = (l: string) => onLanguagesChange(filterLanguages.includes(l) ? filterLanguages.filter(x => x !== l) : [...filterLanguages, l]);

  // Live community count matching the selected filters
  useEffect(() => {
    setLoadingCount(true);
    const params = new URLSearchParams({ limit: '1' });
    if (filterTags.length > 0)      filterTags.forEach(t => params.append('tag', t));
    if (filterLanguages.length > 0) filterLanguages.forEach(l => params.append('language', l));

    fetch(`${API_BASE}/api/v1/communities?${params}`)
      .then(r => r.json())
      .then(d => setMatchCount(d?.pagination?.total ?? (d?.data?.length ?? null)))
      .catch(() => setMatchCount(null))
      .finally(() => setLoadingCount(false));
  }, [filterTags, filterLanguages]);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">Target Audience</h2>
      <p className="text-sm text-text-secondary mb-5">
        Set filters and the platform will automatically match the best communities for your campaign.
        No manual selection needed — our scoring system handles it.
      </p>

      {/* How matching works */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-primary mb-1">How auto-matching works</p>
        <p className="text-xs text-text-secondary">
          After payment, the system scores all matching communities using member count, campaign completion rate,
          advertiser ratings, and activity recency. Your <strong className="text-text-primary">{communityCount} communities</strong> are
          selected from the highest-ranked pool that matches your filters below.
        </p>
      </div>

      {/* Language filter */}
      <div className="mb-5">
        <p className="text-sm font-medium text-text-secondary mb-2">Community Language <span className="text-xs font-normal">(optional)</span></p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => {
            const active = filterLanguages.includes(l.value);
            return (
              <button key={l.value} onClick={() => toggleLang(l.value)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}>
                {active && <span className="mr-1">✓</span>}{l.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic tag filter */}
      <div className="mb-6">
        <p className="text-sm font-medium text-text-secondary mb-2">Community Topics <span className="text-xs font-normal">(optional)</span></p>
        <div className="flex flex-wrap gap-2">
          {TOPIC_TAGS.map((t) => {
            const active = filterTags.includes(t);
            return (
              <button key={t} onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}>
                {active && <span className="mr-1">✓</span>}{t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live match count */}
      <div className="bg-background-tertiary border border-border rounded-lg px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-text-secondary">Communities matching your filters</span>
        {loadingCount ? (
          <span className="text-sm text-text-secondary animate-pulse">Counting…</span>
        ) : matchCount !== null ? (
          <span className={`text-sm font-bold ${matchCount < communityCount ? 'text-accent' : 'text-primary'}`}>
            {matchCount.toLocaleString()}
            {matchCount < communityCount && (
              <span className="ml-1.5 text-xs font-normal text-accent">
                — fewer than your target of {communityCount}
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-text-secondary">—</span>
        )}
      </div>

      {matchCount !== null && matchCount < communityCount && (
        <p className="text-xs text-accent mt-2">
          Fewer communities match your filters than your target count. Consider broadening your filters, or the system will match all available qualifying communities.
        </p>
      )}

      {filterTags.length === 0 && filterLanguages.length === 0 && (
        <p className="text-xs text-text-secondary mt-3">
          No filters set — the system will select the top {communityCount} communities across all registered communities, ranked by score.
        </p>
      )}
    </div>
  );
}

// ==================== Step 5: Schedule & Budget ====================

function StepSchedule({
  duration, communityCount, promotionPackage, onPackageChange, onCommunityCountChange, displayPricing,
}: {
  duration: DurationKey;
  communityCount: CommunityCount;
  promotionPackage: PromotionPackage;
  onPackageChange: (p: PromotionPackage) => void;
  onCommunityCountChange: (c: CommunityCount) => void;
  displayPricing: { communityCharge: number; platformFee: number; total: number };
}) {
  // Duration is locked to the selected package — shown read-only
  const lockedDuration = PACKAGE_DURATION[promotionPackage];
  const durationLabel = DURATION_OPTIONS.find(d => d.value === lockedDuration)?.label ?? lockedDuration;

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">Schedule & Budget</h2>

      {/* Promotion Plan */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-3">Promotion Plan</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PACKAGE_OPTIONS.map((pkg) => {
            const isSelected = promotionPackage === pkg.value;
            return (
              <button key={pkg.value} onClick={() => onPackageChange(pkg.value)}
                className={`p-4 rounded-lg border text-left transition-all ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-text-primary">{pkg.label}</span>
                  {isSelected && <span className="text-primary text-xs font-medium">Selected</span>}
                </div>
                <p className="text-xs text-text-secondary mb-2">{pkg.tagline}</p>
                <ul className="space-y-0.5">
                  {pkg.details.map((d) => (
                    <li key={d} className="text-xs text-text-secondary flex items-center gap-1.5">
                      <span className="text-primary">✓</span>{d}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {/* Campaign Duration — auto-set by package, shown read-only */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-3">Campaign Duration</label>
        <div className="grid grid-cols-3 gap-3">
          {DURATION_OPTIONS.map((option) => {
            const isLocked = option.value !== lockedDuration;
            const isActive = option.value === lockedDuration;
            return (
              <div key={option.value}
                className={`p-3 rounded-lg border text-center select-none
                  ${isActive ? 'border-primary bg-primary/10' : ''}
                  ${isLocked ? 'border-border opacity-35 cursor-not-allowed' : ''}
                `}>
                <p className={`font-medium ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>{option.label}</p>
                <p className="text-xs text-text-secondary">{option.days} days</p>
                {isActive && <p className="text-xs text-primary mt-0.5">Required by plan</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-text-secondary mt-2">Duration is fixed by the selected Promotion Plan.</p>
      </div>

      {/* Number of Communities */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-3">Number of Communities</label>
        <div className="grid grid-cols-3 gap-3">
          {COMMUNITY_OPTIONS.map((count) => (
            <button key={count} onClick={() => onCommunityCountChange(count)}
              className={`p-3 rounded-lg border text-center transition-all ${communityCount === count ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
              <p className="font-medium text-text-primary">{count} Communities</p>
            </button>
          ))}
        </div>
      </div>

      {/* Budget Breakdown */}
      <div className="bg-background-tertiary rounded-lg p-4">
        <h3 className="font-medium text-text-primary mb-3">Budget Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Community Charge</span>
            <span className="text-primary font-medium">${displayPricing.communityCharge.toLocaleString()} USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Platform Fee</span>
            <span className="text-text-primary">${displayPricing.platformFee.toLocaleString()} USDT</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="text-text-secondary font-medium">Total Budget</span>
            <span className="text-text-primary font-bold">${displayPricing.total.toLocaleString()} USDT</span>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-3">
          Payment in USDT · {communityCount} communities × {durationLabel}. Ensure you have sufficient USDT and BNB/ETH for gas.
        </p>
      </div>
    </div>
  );
}

// ==================== Step 6: Review & Pay ====================

function StepReview({
  formData, displayPricing, isConnected, isSubmitting, txHash, chainId, chainName, walletAddress, paymentStatus,
}: {
  formData: FormDataState;
  displayPricing: { communityCharge: number; platformFee: number; total: number };
  isConnected: boolean;
  isSubmitting: boolean;
  txHash: string | null;
  chainId: number;
  chainName: string;
  walletAddress: Address | undefined;
  paymentStatus: string;
}) {
  const durationLabel = DURATION_OPTIONS.find(d => d.value === formData.duration)?.label || formData.duration;
  const pkgOption = PACKAGE_OPTIONS.find(p => p.value === formData.promotionPackage);

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">Review Campaign</h2>
      <div className="space-y-0 divide-y divide-border">
        <ReviewItem label="Ad Copy"            value={formData.promoteContent.adCopy || '—'} mono={false} />
        {formData.promoteContent.contentUrl  && <ReviewItem label="Content URL"    value={formData.promoteContent.contentUrl}  mono={true} />}
        {formData.promoteContent.landingUrl  && <ReviewItem label="Landing Page"   value={formData.promoteContent.landingUrl}  mono={true} />}
        <ReviewItem label="Objectives"         value={formData.objectives.join(', ') || '—'} />
        <ReviewItem label="Promotion Plan"     value={pkgOption ? `${pkgOption.label} — ${pkgOption.tagline}` : formData.promotionPackage} />
        <ReviewItem label="Target Communities" value={`${formData.communityCount} communities (auto-matched)`} />
        {formData.filterTags.length > 0      && <ReviewItem label="Tag Filters"      value={formData.filterTags.join(', ')} />}
        {formData.filterLanguages.length > 0 && <ReviewItem label="Language Filters" value={formData.filterLanguages.join(', ')} />}
        <ReviewItem label="Duration"           value={durationLabel} />
        <ReviewItem label="Network"            value={chainName} note={chainId === 97 ? 'BSC Testnet — for testing only' : undefined} />
        <ReviewItem label="Community Charge"   value={`$${displayPricing.communityCharge.toLocaleString()} USDT`} highlight />
        <ReviewItem label="Platform Fee"       value={`$${displayPricing.platformFee.toLocaleString()} USDT`} />
        <ReviewItem label="Total Budget"       value={`$${displayPricing.total.toLocaleString()} USDT`} />
      </div>
      {walletAddress && (
        <div className="mt-6 p-4 bg-background-tertiary rounded-lg">
          <p className="text-sm text-text-secondary mb-1">Payment From</p>
          <p className="text-text-primary font-mono text-sm break-all">{walletAddress}</p>
        </div>
      )}
      {txHash && (
        <div className="mt-6 p-4 bg-green-500/10 border border-green-500 rounded-lg">
          <p className="text-sm text-green-500 mb-1">Transaction Submitted</p>
          <p className="text-primary text-sm font-mono break-all">{txHash}</p>
        </div>
      )}
      {!isConnected && (
        <div className="mt-4 p-4 bg-accent/10 border border-accent rounded-lg">
          <p className="text-accent text-sm">⚠️ Please connect your wallet to create this campaign</p>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ label, value, note, mono, highlight }: {
  label: string; value: string; note?: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-start py-2.5 gap-4">
      <span className="text-text-secondary text-sm shrink-0">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-medium capitalize ${highlight ? 'text-primary' : 'text-text-primary'} ${mono ? 'font-mono text-xs break-all' : ''}`}>
          {value}
        </span>
        {note && <p className="text-xs text-text-secondary mt-0.5">{note}</p>}
      </div>
    </div>
  );
}
