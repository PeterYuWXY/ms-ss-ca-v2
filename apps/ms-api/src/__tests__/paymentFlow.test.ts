/**
 * Integration tests for campaign payment flow
 * Tests: idempotency, transaction safety, validation
 */

// @jest/globals provides jest in ESM mode (jest global is not injected at module evaluation time)
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Register mock BEFORE dynamic import of the mocked module (ESM: static imports are hoisted
// but dynamic imports respect mock registration order)
const mockCampaign = { findUnique: jest.fn(), update: jest.fn() };
const mockCampaignPayment = { findUnique: jest.fn(), update: jest.fn() };
const mockTransaction = jest.fn();

jest.unstable_mockModule('@ms/database', () => ({
  prisma: {
    campaign: mockCampaign,
    campaignPayment: mockCampaignPayment,
    $transaction: mockTransaction,
  },
}));

const { default: campaignPaymentRouter } = await import('../routes/campaignPayment.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/campaigns', campaignPaymentRouter);
  return app;
}

const VALID_TX = '0x' + 'a'.repeat(64);
const CAMPAIGN_ID = 'camp-test-1';

const pendingPayment = {
  campaignId: CAMPAIGN_ID,
  status: 'pending',
  txHash: null,
  paidAt: null,
  totalAmount: '1000000',
  platformFee: '300000',
  caReward: '700000',
};

const pendingCampaign = {
  id: CAMPAIGN_ID,
  status: 'pending',
  timeline: {},
  payment: pendingPayment,
};

const paidCampaign = {
  ...pendingCampaign,
  status: 'active',
  payment: {
    ...pendingPayment,
    status: 'paid',
    txHash: VALID_TX,
    paidAt: new Date('2024-01-01'),
  },
};

const app = buildApp();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/campaigns/:id/confirm-payment', () => {
  describe('validation', () => {
    it('rejects missing txHash with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects malformed txHash with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: 'not-a-hash' });
      expect(res.status).toBe(400);
    });

    it('rejects short txHash with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: '0xabc123' });
      expect(res.status).toBe(400);
    });
  });

  describe('not found cases', () => {
    it('returns 404 when campaign does not exist', async () => {
      mockCampaign.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when payment record is missing', async () => {
      mockCampaign.findUnique.mockResolvedValue({ ...pendingCampaign, payment: null });
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('payment record not found');
    });
  });

  describe('idempotency', () => {
    it('returns current state immediately if already paid — no DB write', async () => {
      mockCampaign.findUnique.mockResolvedValue(paidCampaign);
      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('paid');
      expect(res.body.data.txHash).toBe(VALID_TX);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('calling confirm-payment twice on paid campaign always returns 200', async () => {
      mockCampaign.findUnique.mockResolvedValue(paidCampaign);
      const res1 = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });
      const res2 = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('successful payment confirmation', () => {
    it('updates payment and campaign atomically using $transaction', async () => {
      mockCampaign.findUnique.mockResolvedValue(pendingCampaign);
      mockTransaction.mockResolvedValue([
        { ...pendingPayment, status: 'paid', txHash: VALID_TX, paidAt: new Date() },
        { ...pendingCampaign, status: 'active' },
      ]);

      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.paymentStatus).toBe('paid');
      expect(res.body.data.txHash).toBe(VALID_TX);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns paidAt in response', async () => {
      const paidAt = new Date('2024-06-15T10:00:00Z');
      mockCampaign.findUnique.mockResolvedValue(pendingCampaign);
      mockTransaction.mockResolvedValue([
        { ...pendingPayment, status: 'paid', txHash: VALID_TX, paidAt },
        { ...pendingCampaign, status: 'active' },
      ]);

      const res = await request(app)
        .post(`/api/v1/campaigns/${CAMPAIGN_ID}/confirm-payment`)
        .send({ txHash: VALID_TX });

      expect(res.body.data.paidAt).toBeDefined();
    });
  });
});

describe('GET /api/v1/campaigns/:id/payment-status', () => {
  it('returns 404 when payment record not found', async () => {
    mockCampaignPayment.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/campaigns/${CAMPAIGN_ID}/payment-status`);
    expect(res.status).toBe(404);
  });

  it('returns payment status and amounts', async () => {
    mockCampaignPayment.findUnique.mockResolvedValue(pendingPayment);
    const res = await request(app).get(`/api/v1/campaigns/${CAMPAIGN_ID}/payment-status`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.totalAmount).toBe('1000000');
    expect(res.body.data.platformFee).toBe('300000');
    expect(res.body.data.caReward).toBe('700000');
  });
});

describe('POST /api/v1/campaigns/:id/refund', () => {
  it('returns 404 when campaign not found', async () => {
    mockCampaign.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/campaigns/${CAMPAIGN_ID}/refund`)
      .send({ reason: 'test' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when campaign is active (cannot refund)', async () => {
    mockCampaign.findUnique.mockResolvedValue({ ...pendingCampaign, status: 'active' });
    const res = await request(app)
      .post(`/api/v1/campaigns/${CAMPAIGN_ID}/refund`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active');
  });

  it('cancels pending campaign and marks payment refunded', async () => {
    mockCampaign.findUnique.mockResolvedValue(pendingCampaign);
    mockCampaignPayment.update.mockResolvedValue({});
    mockCampaign.update.mockResolvedValue({ ...pendingCampaign, status: 'cancelled' });

    const res = await request(app)
      .post(`/api/v1/campaigns/${CAMPAIGN_ID}/refund`)
      .send({ reason: 'payment failed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(mockCampaignPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'refunded' } })
    );
  });

  it('cancels draft campaign without payment record', async () => {
    mockCampaign.findUnique.mockResolvedValue({ ...pendingCampaign, status: 'draft', payment: null });
    mockCampaign.update.mockResolvedValue({ status: 'cancelled' });

    const res = await request(app)
      .post(`/api/v1/campaigns/${CAMPAIGN_ID}/refund`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});
