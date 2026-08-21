import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self' https://* http://*",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*",
      "style-src 'self' 'unsafe-inline' https://*",
      "img-src 'self' data: blob: https://*",
      "font-src 'self' https://* data:",
      "connect-src 'self' https://* http://* wss://* ws://*",
      "frame-ancestors 'self' https://huggingface.co https://*.hf.space",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
