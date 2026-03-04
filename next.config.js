/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/company/list.json", destination: "/api/dart/companies" },
    ];
  },
};

module.exports = nextConfig;
