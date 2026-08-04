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
        // OBJECT form only — a substring-matching manualChunks FUNCTION was
        // tried (2026-08-03) and produced a react-vendor ↔ chart-vendor import
        // CYCLE ("Cannot access '$' before initialization", white admin).
        // Object form lists entry modules and lets rollup place shared deps
        // acyclically. icons-vendor: the icon-picker's 9 full react-icons
        // libraries + lucide (~11 MB min) — kept out of the main chunk so
        // memory-capped CI builds don't OOM rendering one 15 MB chunk. Icon
        // libs depend only on react, so this split cannot form a cycle.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'utils-vendor': ['axios', 'date-fns'],
          'icons-vendor': [
            'react-icons/ai', 'react-icons/bi', 'react-icons/bs',
            'react-icons/fa', 'react-icons/fi', 'react-icons/hi',
            'react-icons/io5', 'react-icons/md', 'react-icons/tb',
            'lucide-react',
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});

