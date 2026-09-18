/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/nextadmin';
const basePath = rawBasePath ? (rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`) : '';

const nextConfig = {
  reactStrictMode: true,
  basePath: basePath === '' ? undefined : basePath,
};

export default nextConfig;
