import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The kiosk PWA runs on its own dev port (5174) so it never collides with the
// main HRMS client (5173). All /api calls are proxied to the same backend the
// client uses (localhost:5001). Proxying (rather than hitting the API's origin
// directly) keeps requests SAME-ORIGIN, which:
//   1. sidesteps CORS entirely — the server's CORS_ORIGIN only whitelists the
//      client's 5173 origin, not this app's 5174.
//   2. lets the httpOnly device refresh cookie (path /api/auth) be sent and
//      received automatically with withCredentials, no cross-site cookie rules.
// In production, serve this build behind a reverse proxy that forwards /api to
// the HRMS server the same way (see README).
export default defineConfig({
  plugins: [react()],
  // Absolute (site-root-relative) base, configurable via VITE_BASE_PATH so
  // this can be reverse-proxied under a subpath (e.g. VITE_BASE_PATH=/kiosk-app)
  // instead of needing its own exposed port — same mechanism as client/vite.config.js.
  base: `${process.env.VITE_BASE_PATH || ''}/`,
  // face-api.js / tfjs reference `global`; map it to globalThis for the browser.
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
