import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

// 使用LRU缓存存储限流数据
const rateLimitCache = new LRUCache<string, RateLimitInfo>({
  max: 10000, // 最多存储10000个IP
  ttl: 60000, // 默认1分钟过期
});

/**
 * 限流配置
 * - API路由: 100请求/分钟
 * - 敏感操作: 10请求/分钟
 * - 静态资源: 1000请求/分钟
 */
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  default: { windowMs: 60 * 1000, maxRequests: 100 },
  sensitive: { windowMs: 60 * 1000, maxRequests: 10 },
  static: { windowMs: 60 * 1000, maxRequests: 1000 },
};

// 敏感操作路由列表
const sensitivePaths = [
  '/api/v1/campaigns/create',
  '/api/v1/payments',
  '/api/v1/auth',
  '/ca/v1/offers',
];

function getClientIP(request: NextRequest): string {
  // 获取真实IP，支持代理
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'anonymous';
}

function getRateLimitConfig(pathname: string): RateLimitConfig {
  if (sensitivePaths.some(path => pathname.startsWith(path))) {
    return rateLimitConfigs.sensitive;
  }
  
  if (pathname.startsWith('/_next/') || pathname.startsWith('/static/')) {
    return rateLimitConfigs.static;
  }
  
  return rateLimitConfigs.default;
}

export function checkRateLimit(request: NextRequest): {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
} {
  const clientIP = getClientIP(request);
  const pathname = request.nextUrl.pathname;
  const config = getRateLimitConfig(pathname);
  
  const key = `${clientIP}:${pathname}`;
  const now = Date.now();
  
  let info = rateLimitCache.get(key);
  
  if (!info || now > info.resetTime) {
    // 新窗口或窗口已过期
    info = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitCache.set(key, info);
    
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: Math.ceil(info.resetTime / 1000),
    };
  }
  
  // 窗口内请求
  info.count++;
  
  const allowed = info.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - info.count);
  
  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    reset: Math.ceil(info.resetTime / 1000),
  };
}

export function rateLimitMiddleware(request: NextRequest): NextResponse | null {
  // 跳过健康检查和内部路由
  if (request.nextUrl.pathname === '/health') {
    return null;
  }
  
  const rateLimit = checkRateLimit(request);
  
  // 添加限流头
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(rateLimit.limit));
  headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  headers.set('X-RateLimit-Reset', String(rateLimit.reset));
  
  if (!rateLimit.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimit.reset - Math.ceil(Date.now() / 1000),
      }),
      {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.reset - Math.ceil(Date.now() / 1000)),
        },
      }
    );
  }
  
  // 返回null表示通过限流检查
  return null;
}
