import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // O design system é consumido como código-fonte para o Tailwind enxergar
  // as classes e para não exigir build separado a cada alteração.
  transpilePackages: ['@aurora/ui'],
  // O build "standalone" gera o bundle autossuficiente usado no container.
  // Fica atrás de uma variável porque, no Windows sem o Modo de Desenvolvedor
  // ligado, ele falha ao criar os symlinks (EPERM) e quebra o build local.
  // O Dockerfile e o CI definem NEXT_OUTPUT=standalone.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' }, // MinIO local
      { protocol: 'https', hostname: '**.r2.dev' }, // Cloudflare R2
    ],
  },
  eslint: {
    // O lint roda como tarefa própria do Turborepo, não dentro do build.
    ignoreDuringBuilds: true,
  },
};

export default config;
