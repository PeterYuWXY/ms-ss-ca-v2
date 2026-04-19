import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimitMiddleware } from './lib/rate-limit';

export function middleware(request: NextRequest) {
  // 应用限流检查
  const rateLimitResponse = rateLimitMiddleware(request);
  
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  // 继续处理请求
  const response = NextResponse.next();
  
  // 添加安全头
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
  
  return response;
}

// 配置中间件匹配路径
export const config = {
  matcher: [
    // 匹配API路由
    '/api/:path*',
    // 匹配CA路由
    '/ca/:path*',
    // 排除静态资源
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
