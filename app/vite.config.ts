import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiProxyTarget = env.DRAWBASE_API_PROXY_TARGET ?? 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiProxyTarget,
        '/health': apiProxyTarget,
      },
    },
  };
});
