import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { errorHandler } from './utils/errors.js';
import { startPerformanceAggregator } from './services/performanceAggregator.js';

// Import routes
import skillsRouter from './routes/skills.js';
import campaignsRouter from './routes/campaigns.js';
import campaignPaymentRouter from './routes/campaignPayment.js';
import communitiesRouter from './routes/communities.js';
import pricingRouter from './routes/pricing.js';
import caRouter from './routes/ca.js';
import ssRouter from './routes/ss.js';
import publicRouter from './routes/public.js';
import offersRouter from './routes/offers.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'ms-api',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/v1/skills', skillsRouter);
app.use('/api/v1/campaigns', campaignsRouter);
app.use('/api/v1/campaigns', campaignPaymentRouter);
app.use('/api/v1/communities', communitiesRouter);
app.use('/api/v1/pricing', pricingRouter);
app.use('/api/v1/ss', ssRouter);
app.use('/ca/v1', caRouter);
app.use('/api/public/v1', publicRouter);
app.use('/api/v1/offers', offersRouter);

// ==================== Click-tracking redirect ====================
// GET /r/:campaignId/:communityId
// Records a click in campaign.performance.clicks and redirects to the target URL.
// Used as the shareable tracking link in the campaign dashboard.
app.get('/r/:campaignId/:communityId', async (req, res) => {
  const { campaignId, communityId } = req.params;
  try {
    const { prisma } = await import('@ms/database');
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { config: true, performance: true },
    });

    if (!campaign) { res.status(404).send('Campaign not found'); return; }

    // Atomically increment click count (read-modify-write; fine for low traffic MVP)
    const perf = (typeof campaign.performance === 'object' && campaign.performance !== null
      ? campaign.performance : {}) as Record<string, unknown>;
    const clicks = (typeof perf.clicks === 'object' && perf.clicks !== null
      ? perf.clicks : {}) as Record<string, number>;
    clicks[communityId] = (clicks[communityId] ?? 0) + 1;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { performance: { ...perf, clicks } as any },
    });

    // Resolve target URL from config.targetUrl or config.promoteContent.landingUrl
    const config = campaign.config as Record<string, unknown>;
    const targetUrl = (config.targetUrl as string | undefined)
      ?? ((config.promoteContent as any)?.landingUrl as string | undefined)
      ?? ((config.promoteContent as any)?.contentUrl as string | undefined);

    if (targetUrl) {
      const sep = targetUrl.includes('?') ? '&' : '?';
      res.redirect(`${targetUrl}${sep}utm_source=msp&utm_campaign=${campaignId}&utm_medium=${communityId}`);
    } else {
      res.status(200).send('Click recorded. No target URL configured for this campaign.');
    }
  } catch (err) {
    console.error('[ClickRedirect] Error:', err);
    res.status(500).send('Error recording click');
  }
});

// Public CA community registration endpoint (called by bot during onboarding)
app.post('/api/v1/ca/register-community', async (req, res) => {
  try {
    const { prisma } = await import('@ms/database');
    const { telegramGroupId, telegramGroupName, telegramHandle, memberCount, ownerWallet, ownerTelegramId } = req.body;

    if (!telegramGroupId || !telegramGroupName || !ownerWallet) {
      res.status(400).json({ success: false, error: 'telegramGroupId, telegramGroupName and ownerWallet are required' });
      return;
    }

    if (!ownerWallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      res.status(400).json({ success: false, error: 'Invalid wallet address format' });
      return;
    }

    // Upsert community by telegram group ID
    const existing = await prisma.community.findFirst({ where: { caBotId: telegramGroupId } });

    const community = existing
      ? await prisma.community.update({
          where: { id: existing.id },
          data: {
            name: telegramGroupName,
            memberCount: memberCount ?? 0,
            memberCountUpdatedAt: new Date(),
            ownerWallet,
            ownerTelegramId: ownerTelegramId ? String(ownerTelegramId) : existing.ownerTelegramId,
            ...(telegramHandle ? { telegramHandle: String(telegramHandle) } : {}),
            status: 'active',
          },
        })
      : await prisma.community.create({
          data: {
            name: telegramGroupName,
            platform: 'telegram',
            memberCount: memberCount ?? 0,
            memberCountUpdatedAt: new Date(),
            caBotId: telegramGroupId,
            ownerWallet,
            ownerTelegramId: ownerTelegramId ? String(ownerTelegramId) : null,
            telegramHandle: telegramHandle ? String(telegramHandle) : null,
            referralCode: randomBytes(4).toString('hex'), // 8-char unique referral code
            status: 'active',
            category: 'general',
            tags: [],
            language: ['en'],
          },
        });

    res.status(201).json({ success: true, data: community });
  } catch (error) {
    console.error('Error in public community registration:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Internal: refresh all community scores (call via cron or admin script)
// POST /internal/refresh-scores  (no auth for now — restrict by network policy in prod)
app.post('/internal/refresh-scores', async (_req, res) => {
  try {
    const { refreshAllScores } = await import('./services/communityScoring.js');
    refreshAllScores().catch((e: unknown) => console.error('[ScoreRefresh]', e)); // fire-and-forget
    res.json({ success: true, message: 'Score refresh started' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to start score refresh' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Global error handler - must be last
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  startPerformanceAggregator();
  console.log(`🚀 MS API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/api/v1/skills`);
});
