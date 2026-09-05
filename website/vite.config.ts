import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'website',
  plugins: [react()],
  build: { outDir: '../dist-website', emptyOutDir: true },
  resolve: {
    alias: {
      '@nipe-solutions/react-drag-dismiss': new URL(
        '../src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
})
