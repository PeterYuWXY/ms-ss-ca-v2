/**
 * Integration tests for CA offer flow
 * Tests: auth middleware, status guard, offer accept/reject, concurrency protection
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';

const mockCommunityAgent = { findUnique: jest.fn() };
const mockOffer = { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() };
const mockCampaign = { findMany: jest.fn() };
const mockExecution = { create: jest.fn(), findMany: jest.fn() };
const mockCampaignCommunity = { updateMany: jest.fn() };
const mockTransaction = jest.fn();

jest.unstable_mockModule('@ms/database', () => ({
  prisma: {
    communityAgent: mockCommunityAgent,
    offer: mockOffer,
    campaign: mockCampaign,
    campaignExecution: mockExecution,
    campaignCommunity: mockCampaignCommunity,
    $transaction: mockTransaction,
  },
}));

const { default: caRouter } = await import('../routes/ca.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/ca/v1', caRouter);
  return app;
}

const BOT_ID = 'bot-123';
const API_KEY = 'test-secret-key';
const API_KEY_HASH = createHash('sha256').update(API_KEY).digest('hex');

const activeAgent = { id: 'agent-uuid-1', apiKeyHash: API_KEY_HASH, status: 'active' };
const agentNoKey = { id: 'agent-uuid-2', apiKeyHash: null, status: 'active' };
const inactiveAgent = { id: 'agent-uuid-3', apiKeyHash: null, status: 'inactive' };

const pendingOffer = {
  id: 'offer-1',
  campaignId: 'camp-1',
  communityId: 'comm-1',
  caId: 'agent-uuid-1',
  status: 'pending',
  task: {},
  reward: { amount: '700000', token: 'USDT' },
  deadline: new Date('2025-12-31'),
  executionStart: null,
  executionEnd: null,
};

const app = buildApp();

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== Auth Middleware ====================

describe('CA auth middleware', () => {
  it('returns 401 when x-ca-bot-id header is missing', async () => {
    const res = await request(app).get('/ca/v1/offers');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Bot ID');
  });

  it('returns 401 when bot-id is unknown', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/ca/v1/offers').set('x-ca-bot-id', 'unknown-bot');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unknown');
  });

  it('returns 403 when CA is not active', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(inactiveAgent);
    const res = await request(app).get('/ca/v1/offers').set('x-ca-bot-id', BOT_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not active');
  });

  it('returns 401 when apiKeyHash is set but Authorization header is missing', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
    const res = await request(app).get('/ca/v1/offers').set('x-ca-bot-id', BOT_ID);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('API key');
  });

  it('returns 403 when API key does not match stored hash', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
    const res = await request(app)
      .get('/ca/v1/offers')
      .set('x-ca-bot-id', BOT_ID)
      .set('Authorization', 'Bearer wrong-key');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Invalid API key');
  });

  it('passes auth when API key matches stored SHA256 hash', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
    mockOffer.findMany.mockResolvedValue([]);
    mockCampaign.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/ca/v1/offers')
      .set('x-ca-bot-id', BOT_ID)
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('passes auth with no apiKeyHash stored (testing mode)', async () => {
    mockCommunityAgent.findUnique.mockResolvedValue(agentNoKey);
    mockOffer.findMany.mockResolvedValue([]);
    mockCampaign.findMany.mockResolvedValue([]);

    const res = await request(app).get('/ca/v1/offers').set('x-ca-bot-id', BOT_ID);
    expect(res.status).toBe(200);
  });
});

// ==================== GET /ca/v1/offers ====================

describe('GET /ca/v1/offers', () => {
  function authedGet(path: string) {
    return request(app)
      .get(path)
      .set('x-ca-bot-id', BOT_ID)
      .set('Authorization', `Bearer ${API_KEY}`);
  }

  beforeEach(() => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
  });

  it('returns empty array when no offers exist', async () => {
    mockOffer.findMany.mockResolvedValue([]);
    mockCampaign.findMany.mockResolvedValue([]);
    const res = await authedGet('/ca/v1/offers');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns formatted offers with reward info and project name', async () => {
    mockOffer.findMany.mockResolvedValue([pendingOffer]);
    mockCampaign.findMany.mockResolvedValue([{
      id: 'camp-1',
      config: { projectInfo: { name: 'Test Project' } },
    }]);
    const res = await authedGet('/ca/v1/offers');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reward.amount).toBe('700000');
    expect(res.body.data[0].reward.token).toBe('USDT');
    expect(res.body.data[0].projectInfo.name).toBe('Test Project');
  });

  it('defaults reward to 0 / USDT when offer has no reward data', async () => {
    mockOffer.findMany.mockResolvedValue([{ ...pendingOffer, reward: null }]);
    mockCampaign.findMany.mockResolvedValue([]);
    const res = await authedGet('/ca/v1/offers');
    expect(res.body.data[0].reward.amount).toBe('0');
    expect(res.body.data[0].reward.token).toBe('USDT');
  });
});

// ==================== POST /ca/v1/offers/:id/accept ====================

describe('POST /ca/v1/offers/:id/accept', () => {
  function authedPost(path: string, body: Record<string, unknown> = {}) {
    return request(app)
      .post(path)
      .set('x-ca-bot-id', BOT_ID)
      .set('Authorization', `Bearer ${API_KEY}`)
      .send(body);
  }

  beforeEach(() => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
  });

  it('returns 404 when offer does not exist', async () => {
    mockOffer.findUnique.mockResolvedValue(null);
    const res = await authedPost('/ca/v1/offers/nonexistent/accept', { communityId: 'comm-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 with status guard when offer is already accepted', async () => {
    mockOffer.findUnique.mockResolvedValue({ ...pendingOffer, status: 'accepted' });
    const res = await authedPost('/ca/v1/offers/offer-1/accept', { communityId: 'comm-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('accepted');
  });

  it('returns 400 with status guard when offer is already rejected', async () => {
    mockOffer.findUnique.mockResolvedValue({ ...pendingOffer, status: 'rejected' });
    const res = await authedPost('/ca/v1/offers/offer-1/accept', { communityId: 'comm-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('rejected');
  });

  it('returns 409 on concurrent acceptance (Prisma P2025)', async () => {
    mockOffer.findUnique.mockResolvedValue(pendingOffer);
    const p2025 = Object.assign(new Error('Record not found'), { code: 'P2025' });
    mockTransaction.mockRejectedValue(p2025);

    const res = await authedPost('/ca/v1/offers/offer-1/accept', { communityId: 'comm-1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already accepted');
  });

  it('accepts a pending offer atomically — returns executionId and status', async () => {
    mockOffer.findUnique.mockResolvedValue(pendingOffer);
    mockTransaction.mockResolvedValue({ id: 'exec-new-1' });

    const res = await authedPost('/ca/v1/offers/offer-1/accept', { communityId: 'comm-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.executionId).toBe('exec-new-1');
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.campaignId).toBe('camp-1');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('includes reward info in acceptance response', async () => {
    mockOffer.findUnique.mockResolvedValue(pendingOffer);
    mockTransaction.mockResolvedValue({ id: 'exec-2' });

    const res = await authedPost('/ca/v1/offers/offer-1/accept', { communityId: 'comm-1' });
    expect(res.body.data.reward.amount).toBe('700000');
    expect(res.body.data.reward.token).toBe('USDT');
  });
});

// ==================== POST /ca/v1/offers/:id/reject ====================

describe('POST /ca/v1/offers/:id/reject', () => {
  function authedPost(path: string, body: Record<string, unknown> = {}) {
    return request(app)
      .post(path)
      .set('x-ca-bot-id', BOT_ID)
      .set('Authorization', `Bearer ${API_KEY}`)
      .send(body);
  }

  beforeEach(() => {
    mockCommunityAgent.findUnique.mockResolvedValue(activeAgent);
  });

  it('returns 404 when offer does not exist', async () => {
    mockOffer.findUnique.mockResolvedValue(null);
    const res = await authedPost('/ca/v1/offers/nonexistent/reject');
    expect(res.status).toBe(404);
  });

  it('rejects offer and updates campaign community status', async () => {
    mockOffer.findUnique.mockResolvedValue(pendingOffer);
    mockOffer.update.mockResolvedValue({ ...pendingOffer, status: 'rejected' });
    mockCampaignCommunity.updateMany.mockResolvedValue({ count: 1 });

    const res = await authedPost('/ca/v1/offers/offer-1/reject', { reason: 'not interested' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(mockOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'rejected' } })
    );
    expect(mockCampaignCommunity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'rejected' } })
    );
  });

  it('rejection works without reason field', async () => {
    mockOffer.findUnique.mockResolvedValue(pendingOffer);
    mockOffer.update.mockResolvedValue({ ...pendingOffer, status: 'rejected' });
    mockCampaignCommunity.updateMany.mockResolvedValue({ count: 1 });

    const res = await authedPost('/ca/v1/offers/offer-1/reject');
    expect(res.status).toBe(200);
    expect(res.body.data.offerId).toBe('offer-1');
  });
});
