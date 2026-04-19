import { validateShillingExecution, generateShillingReport } from '../services/shillingEngine.js';
import type { ShillingRequirements } from '../services/shillingEngine.js';

const DEFAULT_REQUIREMENTS: ShillingRequirements = {
  pinnedPost: true,
  groupAds: 3,
  discussions: 2,
};

const now = new Date();

const fullShillingData = {
  pinnedPost: { messageId: 'msg-1', postedAt: now, screenshotUrl: 'https://example.com/ss.png' },
  groupAds: [
    { messageId: 'ad-1', postedAt: now, content: 'Ad 1' },
    { messageId: 'ad-2', postedAt: now, content: 'Ad 2' },
    { messageId: 'ad-3', postedAt: now, content: 'Ad 3' },
  ],
  discussions: [
    { messageId: 'd-1', postedAt: now, initiatedBy: 'user-1' },
    { messageId: 'd-2', postedAt: now, initiatedBy: 'user-2' },
  ],
};

describe('validateShillingExecution', () => {
  describe('all requirements met', () => {
    it('returns valid=true with score=100', () => {
      const result = validateShillingExecution(fullShillingData, DEFAULT_REQUIREMENTS);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.missing).toHaveLength(0);
    });

    it('details reflect actual counts', () => {
      const result = validateShillingExecution(fullShillingData, DEFAULT_REQUIREMENTS);
      expect(result.details.pinnedPost).toBe(true);
      expect(result.details.groupAdsCount).toBe(3);
      expect(result.details.discussionsCount).toBe(2);
    });
  });

  describe('missing pinned post', () => {
    it('returns valid=false and includes missing message', () => {
      const data = { ...fullShillingData, pinnedPost: undefined as any };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('Pinned post is required');
    });

    it('score is reduced by 30 points (70 instead of 100)', () => {
      const data = { ...fullShillingData, pinnedPost: undefined as any };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      expect(result.score).toBe(70);
    });
  });

  describe('partial group ads', () => {
    it('score is proportional when count < required', () => {
      const data = {
        ...fullShillingData,
        groupAds: [{ messageId: 'ad-1', postedAt: now, content: 'Ad 1' }], // 1 of 3
      };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      // pinned=30, groupAds=(1/3)*30≈10, discussions=40 → 80
      expect(result.score).toBe(80);
      expect(result.valid).toBe(false);
    });

    it('score is capped at 30 when count exceeds required', () => {
      const data = {
        ...fullShillingData,
        groupAds: Array.from({ length: 10 }, (_, i) => ({ messageId: `ad-${i}`, postedAt: now, content: `Ad ${i}` })),
      };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      expect(result.score).toBe(100);
    });
  });

  describe('partial discussions', () => {
    it('score is proportional when count < required', () => {
      const data = {
        ...fullShillingData,
        discussions: [{ messageId: 'd-1', postedAt: now, initiatedBy: 'user-1' }], // 1 of 2
      };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      // pinned=30, groupAds=30, discussions=(1/2)*40=20 → 80
      expect(result.score).toBe(80);
    });
  });

  describe('score threshold for passing', () => {
    it('score of 70+ is passing (pinned post missing → score=70)', () => {
      const data = { ...fullShillingData, pinnedPost: undefined as any };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      // valid=false due to missing requirement, but score=70
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('missing group ads below 70 threshold fails', () => {
      const data = {
        ...fullShillingData,
        pinnedPost: undefined as any,
        groupAds: [],
        discussions: [],
      };
      const result = validateShillingExecution(data, DEFAULT_REQUIREMENTS);
      expect(result.valid).toBe(false);
      expect(result.score).toBeLessThan(70);
    });
  });

  describe('empty data', () => {
    it('returns valid=false with score=0 when all data is missing', () => {
      const result = validateShillingExecution({} as any, DEFAULT_REQUIREMENTS);
      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.missing).toHaveLength(3);
    });
  });

  describe('pinnedPost not required', () => {
    it('gives bonus 10 points for optional pinned post', () => {
      const requirements: ShillingRequirements = { ...DEFAULT_REQUIREMENTS, pinnedPost: false };
      const result = validateShillingExecution(fullShillingData, requirements);
      // pinned=10 (optional bonus), groupAds=30, discussions=40 → 80
      expect(result.score).toBe(80);
      expect(result.valid).toBe(true);
    });
  });
});

describe('generateShillingReport', () => {
  const baseExecution = {
    id: 'exec-1',
    status: 'completed',
    shillingData: fullShillingData,
    campaignId: 'camp-1',
    caId: 'ca-1',
    communityId: 'comm-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    offer: null,
  } as any;

  it('returns passing summary when execution is valid', () => {
    const report = generateShillingReport(baseExecution, DEFAULT_REQUIREMENTS);
    expect(report.summary).toContain('100/100');
    expect(report.score).toBe(100);
    expect(report.recommendations).toHaveLength(0);
  });

  it('includes recommendations for missing items', () => {
    const execution = {
      ...baseExecution,
      shillingData: {},
    };
    const report = generateShillingReport(execution, DEFAULT_REQUIREMENTS);
    expect(report.recommendations).toContain('Add a pinned post to increase visibility');
    expect(report.recommendations.some(r => r.includes('group ads'))).toBe(true);
    expect(report.recommendations.some(r => r.includes('discussions'))).toBe(true);
  });

  it('includes executionId in details', () => {
    const report = generateShillingReport(baseExecution, DEFAULT_REQUIREMENTS);
    expect(report.details.executionId).toBe('exec-1');
  });

  it('returns incomplete summary when validation fails', () => {
    const execution = { ...baseExecution, shillingData: {} };
    const report = generateShillingReport(execution, DEFAULT_REQUIREMENTS);
    expect(report.summary).toContain('incomplete');
  });
});
