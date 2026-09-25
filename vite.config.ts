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
        // acyclically.
        //
        // `icons-vendor` is GONE (2026-09-25). Naming the nine react-icons
        // families here made each barrel a chunk ENTRY, so all ~30,000 icons
        // were emitted whether or not anything used them — 10.98 MB raw /
        // 2.29 MB gzipped, and modulepreloaded on every page because the entry
        // touched the chunk. `components/IconPicker.tsx` now loads each family
        // through `import()`, so rollup emits a family only when it is asked
        // for, and named `FaX`/`LucideX` imports across the pages tree-shake
        // into the chunk that uses them.
        // `clsx`, `tailwind-merge` and `cva` are named here on purpose. `clsx`
        // is a recharts DEPENDENCY, so without a home of its own rollup put it
        // inside `chart-vendor` — and `lib/utils.ts` (`cn()`, used by every
        // shadcn component in the shell) then statically imported that chunk,
        // which modulepreloaded all 443 kB of recharts on every first load for
        // a 200-byte helper.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'utils-vendor': ['axios', 'date-fns', 'clsx', 'tailwind-merge', 'class-variance-authority'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});

