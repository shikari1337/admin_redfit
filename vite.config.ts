import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Function form so PACKAGE SUBPATHS split too: the icon-picker imports
        // 10 FULL react-icons libraries (~10 MB minified) which used to sit in
        // the main chunk — rendering one 15 MB chunk is what OOM-kills builds
        // in memory-capped CI containers. Order matters: react-icons must be
        // claimed before the bare "react" match.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-icons') || id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('recharts') || id.includes('/d3-')) return 'chart-vendor';
          if (id.includes('react-router')) return 'react-vendor';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('axios') || id.includes('date-fns')) return 'utils-vendor';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});

