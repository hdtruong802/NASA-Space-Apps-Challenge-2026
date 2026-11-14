import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const webappEnv = loadEnv(mode, __dirname, '');

  // Keep server-only OPENAI_API_KEY strictly out of client JS bundles.
  const clientOpenaiApiKey = (
    webappEnv.VITE_OPENAI_API_KEY ||
    rootEnv.VITE_OPENAI_API_KEY ||
    ''
  ).trim();

  const serverKey = (
    webappEnv.OPENAI_API_KEY ||
    rootEnv.OPENAI_API_KEY ||
    clientOpenaiApiKey
  ).trim();

  const openaiModel = (
    webappEnv.VITE_OPENAI_MODEL ||
    webappEnv.OPENAI_MODEL ||
    webappEnv.OPENAI_OPENAI_MODEL ||
    rootEnv.VITE_OPENAI_MODEL ||
    rootEnv.OPENAI_MODEL ||
    rootEnv.OPENAI_OPENAI_MODEL ||
    'gpt-4o-mini'
  ).trim();

  const openaiProxy = serverKey
    ? {
        '/api/openai/chat': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: () => '/v1/chat/completions',
          headers: {
            Authorization: `Bearer ${serverKey}`,
          },
        },
      }
    : undefined;

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    ...(openaiProxy
      ? {
          server: { proxy: openaiProxy },
          preview: { proxy: openaiProxy },
        }
      : {}),
    define: {
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(clientOpenaiApiKey),
      'import.meta.env.VITE_OPENAI_MODEL': JSON.stringify(openaiModel || 'gpt-4o-mini'),
    },
  };
});
