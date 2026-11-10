import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.js'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Three.js dans son propre fichier : mis en cache une fois, la mise a jour de l'appli ne le recharge pas (point 89).
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
