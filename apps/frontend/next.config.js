/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [{ source: '/graphql', destination: `${process.env.API_GATEWAY_URL || 'http://127.0.0.1:4000'}/graphql` }];
  },
};
export default nextConfig;
