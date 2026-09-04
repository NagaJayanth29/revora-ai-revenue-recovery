import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep default `.next` — on low-disk machines create a junction to another drive:
  //   cmd /c mklink /J .next D:\revora-next
};

export default nextConfig;
