import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://birk-fx-api.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
<<<<<<< HEAD:frontend/vite.config.js
    outDir: 'dist'
=======
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
>>>>>>> bb08416930740bc5910645dbe91a66b4c9a773f8:vite.config.js
  }
});