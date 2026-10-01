import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Only used when running Vite directly next to `netlify functions:serve`
    // (see README). Under `netlify dev`, Netlify routes function calls itself.
    proxy: { '/.netlify/functions': 'http://localhost:9999' },
  },
  build: { chunkSizeWarningLimit: 2500 },
});
