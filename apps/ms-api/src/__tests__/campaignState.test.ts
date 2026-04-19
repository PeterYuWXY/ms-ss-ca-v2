import { TaskStateMachine } from '../services/campaignState.js';
import type { CampaignExecution } from '@ms/database';

// CampaignStateMachine requires a live DB — tested in integration tests.
// This file covers TaskStateMachine which is pure (no DB calls).

function makeExecution(status: CampaignExecution['status']): CampaignExecution {
  return {
    id: 'exec-1',
    campaignId: 'camp-1',
    caId: 'ca-1',
    communityId: 'comm-1',
    status,
    shillingData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CampaignExecution;
}

describe('TaskStateMachine', () => {
  describe('currentStatus', () => {
    it('returns the execution status', () => {
      const sm = new TaskStateMachine(makeExecution('pending'));
      expect(sm.currentStatus).toBe('pending');
    });
  });

  describe('canTransition', () => {
    it('pending → accepted: allowed', () => {
      expect(new TaskStateMachine(makeExecution('pending')).canTransition('accepted')).toBe(true);
    });

    it('pending → rejected: allowed', () => {
      expect(new TaskStateMachine(makeExecution('pending')).canTransition('rejected')).toBe(true);
    });

    it('pending → executing: not allowed', () => {
      expect(new TaskStateMachine(makeExecution('pending')).canTransition('executing')).toBe(false);
    });

    it('accepted → executing: allowed', () => {
      expect(new TaskStateMachine(makeExecution('accepted')).canTransition('executing')).toBe(true);
    });

    it('accepted → completed: allowed', () => {
      expect(new TaskStateMachine(makeExecution('accepted')).canTransition('completed')).toBe(true);
    });

    it('executing → completed: allowed', () => {
      expect(new TaskStateMachine(makeExecution('executing')).canTransition('completed')).toBe(true);
    });

    it('executing → pending: not allowed (no going back)', () => {
      expect(new TaskStateMachine(makeExecution('executing')).canTransition('pending')).toBe(false);
    });

    it('completed → any: not allowed (terminal state)', () => {
      const sm = new TaskStateMachine(makeExecution('completed'));
      expect(sm.canTransition('pending')).toBe(false);
      expect(sm.canTransition('accepted')).toBe(false);
      expect(sm.canTransition('executing')).toBe(false);
    });

    it('rejected → any: not allowed (terminal state)', () => {
      const sm = new TaskStateMachine(makeExecution('rejected'));
      expect(sm.canTransition('pending')).toBe(false);
      expect(sm.canTransition('accepted')).toBe(false);
    });
  });

  describe('transition', () => {
    it('returns success=true for valid transition', () => {
      const result = new TaskStateMachine(makeExecution('pending')).transition('accepted');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns success=false with error for invalid transition', () => {
      const result = new TaskStateMachine(makeExecution('completed')).transition('pending');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid transition/);
    });

    it('error message includes from/to status', () => {
      const result = new TaskStateMachine(makeExecution('rejected')).transition('executing');
      expect(result.error).toContain('rejected');
      expect(result.error).toContain('executing');
    });
  });
});
