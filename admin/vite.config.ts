import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A separate, minimal build on purpose — see README.md. No path aliases
// into ../src: the one thing intentionally shared is ../src/types/database,
// imported by its real relative path so a schema change to it is visible
// here immediately rather than silently drifting out of sync.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
