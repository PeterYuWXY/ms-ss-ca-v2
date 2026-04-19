import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MS_API_URL = process.env.MS_API_URL || 'http://localhost:3001';
const CA_BOT_ID = process.env.CA_BOT_ID || 'ca-bot-dev';
const CA_API_KEY = process.env.MS_API_KEY || '';

// All CA Bot calls go to MS API at /ca/v1/ — there is no separate SS service in 1.0
export const msApi = axios.create({
  baseURL: MS_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-CA-Bot-ID': CA_BOT_ID,
  },
  timeout: 10000,
});

msApi.interceptors.request.use((config) => {
  if (CA_API_KEY) config.headers.Authorization = `Bearer ${CA_API_KEY}`;
  return config;
});

// ==================== Offers ====================

export async function fetchOffersByCommunity(communityId: string, status = 'pending') {
  const res = await msApi.get(`/api/v1/offers?communityId=${communityId}&status=${status}&limit=10`);
  return res.data;
}

export async function acceptOffer(offerId: string, communityId: string) {
  const res = await msApi.post(`/ca/v1/offers/${offerId}/accept`, { caId: CA_BOT_ID, communityId });
  return res.data;
}

export async function rejectOffer(offerId: string, communityId: string, reason?: string) {
  const res = await msApi.post(`/ca/v1/offers/${offerId}/reject`, { caId: CA_BOT_ID, communityId, reason });
  return res.data;
}

// ==================== Executions ====================

export async function reportAction(executionId: string, data: {
  type: 'pinned_post' | 'group_ad' | 'discussion' | 'unpinned_post';
  messageId?: number;
  metadata?: Record<string, unknown>;
}) {
  const res = await msApi.post(`/ca/v1/tasks/${executionId}/executions`, {
    caId: CA_BOT_ID,
    ...data,
    timestamp: new Date().toISOString(),
  });
  return res.data;
}

export async function completeTask(executionId: string, details: Record<string, unknown>) {
  const res = await msApi.patch(`/ca/v1/tasks/${executionId}/status`, {
    caId: CA_BOT_ID,
    status: 'completed',
    details,
    timestamp: new Date().toISOString(),
  });
  return res.data;
}

export async function failTask(executionId: string, reason: string) {
  const res = await msApi.patch(`/ca/v1/tasks/${executionId}/status`, {
    caId: CA_BOT_ID,
    status: 'completed',  // use completed with failed flag (state machine limitation)
    details: { failed: true, reason },
    timestamp: new Date().toISOString(),
  });
  return res.data;
}

// ==================== Offers query (public, communityId-scoped) ====================

export async function fetchCompletedOffers(communityId: string) {
  const res = await msApi.get(`/api/v1/offers?communityId=${communityId}&status=completed&limit=50`);
  return res.data;
}

export async function fetchAcceptedOffers(communityId: string) {
  const res = await msApi.get(`/api/v1/offers?communityId=${communityId}&status=accepted&limit=10`);
  return res.data;
}
