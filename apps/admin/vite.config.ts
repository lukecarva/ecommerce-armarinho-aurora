import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O painel pode ser servido na raiz (dev) ou sob um caminho, quando divide o
  // domínio com a vitrine — como acontece na homologação, em /painel/.
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
});
