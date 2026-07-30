import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('recharts')) return 'charts';
          if (id.includes('date-fns')) return 'date-utils';
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('\\react\\') ||
            id.includes('/react/')
          ) {
            return 'react-vendor';
          }
          if (
            id.includes('socket.io-client') ||
            id.includes('axios') ||
            id.includes('react-hot-toast')
          ) {
            return 'app-vendor';
          }
        },
      },
    },
  },
});
