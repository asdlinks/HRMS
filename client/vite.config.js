import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Must be an absolute (site-root-relative) path, not './' — a relative base
  // resolves against the CURRENT URL, which breaks on refresh at any nested
  // client-side route (e.g. /employees/5) since the browser then looks for
  // assets under /employees/ instead of the site root. Tied to the same
  // VITE_BASE_PATH used by src/config/basePath.ts so a prefixed deployment
  // (e.g. VITE_BASE_PATH=/leave_management) still resolves correctly.
  base: `${process.env.VITE_BASE_PATH || ''}/`,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-grid': ['@mui/x-data-grid'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
})
