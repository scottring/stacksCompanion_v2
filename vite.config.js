import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: process.env.PORT || 3000
  }
}); 