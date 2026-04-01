import type { NextConfig } from "next"

const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ? process.env.NEXT_ALLOWED_DEV_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["localhost", "127.0.0.1"]

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins,
}

export default nextConfig
