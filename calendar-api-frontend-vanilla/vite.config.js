import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://api.getsling.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Adjust the rewrite as necessary
        // secure: true, // Set this to `true` if the target server uses a valid SSL certificate
      },
    },
  },
});