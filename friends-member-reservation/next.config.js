/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: []
  },
  experimental: {
    // Enable App Router if desired
    appDir: true
  }
};

module.exports = nextConfig;