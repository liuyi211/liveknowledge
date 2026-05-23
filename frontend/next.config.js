/** @type {import('next').NextConfig} */
const apiBaseUrl = process.env.BACKEND_API_BASE || 'http://localhost:3001';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
