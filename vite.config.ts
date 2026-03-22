import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: 'localhost',
      proxy: {
        // Proxy para API routes em desenvolvimento
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    optimizeDeps: {
      include: ['better-auth/client', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    },
    plugins: [react()],
    define: {
      // IMPORTANTE: NÃO expor GEMINI_API_KEY no frontend!
      // A chave Gemini deve ser usada APENAS nas serverless functions (pasta api/)
      // Variáveis do frontend devem usar o prefixo VITE_
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
        },
      },
    },
    test: {
      dir: 'src/test',
      include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['src/test/e2e/**', '.claude/**', '**/.claude/**', '**/node_modules/**', '**/dist/**'],
    },
  };
});
