import type { NextConfig } from 'next';

const scriptSources = ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'];
if (process.env.NODE_ENV !== 'production') scriptSources.push("'unsafe-eval'");

const securityHeaders = [
  { key: 'Content-Security-Policy', value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https://*.supabase.co https:; media-src 'self' blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src ${scriptSources.join(' ')}; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests` },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const noStoreHeaders = [
  {
    key: 'Cache-Control',
    value: 'no-store, max-age=0',
  },
];

const nextConfig: NextConfig = {
  agentRules: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/',
        headers: noStoreHeaders,
      },
      {
        source: '/sistema',
        headers: noStoreHeaders,
      },
      {
        source: '/api/admin/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/contact/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/push/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/api/auth/:path*',
        headers: noStoreHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          ...noStoreHeaders,
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
