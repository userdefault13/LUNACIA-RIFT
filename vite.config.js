import { defineConfig } from 'vite';

/** Round-1 Spine spike: Vite bundles @axieinfinity/mixer when node_modules exists. */
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ['@axieinfinity/mixer', 'pixi.js', 'pixi-spine', 'three', 'colyseus.js'],
  },
});
