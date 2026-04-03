import type { NextConfig } from "next"
import { fileURLToPath } from "node:url"

const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ? process.env.NEXT_ALLOWED_DEV_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["localhost", "127.0.0.1"]

const turbopackRoot = fileURLToPath(new URL(".", import.meta.url))

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins,
  turbopack: {
    root: turbopackRoot,
  },
}

export default nextConfig
