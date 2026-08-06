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
          /*
            socket.io iba junto con axios y react-hot-toast en `app-vendor`.
            El problema es que axios se usa en todas las pantallas, así que ese
            paquete se descarga siempre... arrastrando socket.io adentro.

            La carta pública no usa sockets en ningún lado: son del panel, del
            KDS, del rider y del seguimiento de pedido. Separándolo, el cliente
            que entra a mirar el menú deja de bajarse la librería de tiempo real
            —unos 25 KB comprimidos— para no usarla nunca.
          */
          if (id.includes('socket.io') || id.includes('engine.io')) {
            return 'tiempo-real';
          }
          if (id.includes('axios') || id.includes('react-hot-toast')) {
            return 'app-vendor';
          }
          /*
            framer-motion NO se agrupa a mano a propósito. Se probó darle su
            propio paquete y salió peor: al declararlo en `manualChunks`,
            Rollup lo trata como un paquete fijo y lo sube a la carga inicial
            (186 KB contra 156). Dejándolo suelto, se va solo adentro de los
            paquetes diferidos de los modales, que es donde tiene que estar.
          */
        },
      },
    },
  },
});
