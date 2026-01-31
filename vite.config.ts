import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 8977,
      host: '0.0.0.0',
      allowedHosts: ['hoverwars.xyz', 'www.hoverwars.xyz', 'localhost'],
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    plugins: [react()],
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['@linera/client'],
    },
    build: {
      target: 'esnext',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    }
  };
});