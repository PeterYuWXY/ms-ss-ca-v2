/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ['@ms/types', '@ms/utils'],
  images: {
    domains: ['localhost'],
  },
  // Force dynamic rendering for pages that use client-side APIs
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
      {
        source: '/api/trpc/:path*',
        destination: 'http://localhost:3001/trpc/:path*',
      },
    ];
  },
};

// Development CSP - allows unsafe-eval for hot reload
const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  nextConfig.headers = async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob:; font-src 'self';",
        },
      ],
    },
  ];
}

module.exports = nextConfig;
