import { vercelPreset } from '@vercel/react-router/vite';
import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default
  ssr: true,
  // Enable the Vercel Preset - this is CRITICAL for API routes to work as serverless functions
  presets: [vercelPreset()],
} satisfies Config;