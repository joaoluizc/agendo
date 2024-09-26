import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/slingapi': {
        target: 'https://api.getsling.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/slingapi/, ''), // Adjust the rewrite as necessary
        // secure: true, // Set this to `true` if the target server uses a valid SSL certificate
      },
      '/api': {
        target: 'http://calendar-api-backend:3001',
        // target: 'https://agendo-backend.onrender.com/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Adjust the rewrite as necessary
        // secure: true, // Set this to `true` if the target server uses a valid SSL certificate
      }
    },
  },
})
