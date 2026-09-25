import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@turistero/config", "@turistero/types", "@turistero/mocks"],
  images: {
    // Fase 4: añadir hosts de imágenes reales de fuentes aprobadas.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  experimental: { optimizePackageImports: ["lucide-react"] },
};
export default config;
