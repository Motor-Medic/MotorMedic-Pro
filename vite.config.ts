import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * AR-28 vendor isolation.
 *
 * Heavy standalone dependencies are placed in dedicated manual chunks so they
 * never inflate the entry chunk and stay cacheable across deploys. Buckets are
 * deliberately narrow: a module only lands here when its own package matches,
 * so shared helpers keep following their importers (e.g. a chart util shared
 * with app code stays out of the vendor bucket).
 *
 * `build.chunkSizeWarningLimit` is intentionally NOT set: chunk advisories are
 * removed by splitting, never by raising the 500 kB threshold.
 */
function manualVendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  const normalized = id.split("?")[0].replace(/\\/g, "/");
  const inPkg = (name: string) => normalized.includes(`/node_modules/${name}/`);
  if (inPkg("recharts") || inPkg("victory-vendor") || /\/node_modules\/d3-[a-z0-9-]+\//.test(normalized)) {
    return "vendor-charts";
  }
  if (inPkg("xlsx")) return "vendor-excel";
  if (inPkg("jspdf")) return "vendor-pdf";
  if (inPkg("lucide-react")) return "vendor-icons";
  if (inPkg("react-dom") || inPkg("react") || inPkg("react-is") || inPkg("scheduler")) return "vendor-react";
  if (inPkg("motion-dom") || inPkg("motion-utils") || inPkg("framer-motion") || inPkg("motion")) return "vendor-motion";
  if (inPkg("pdfjs-dist")) return "vendor-pdfjs";
  if (inPkg("papaparse") || inPkg("exifr") || inPkg("buffer")) return "vendor-misc";
  return undefined;
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: manualVendorChunk,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Browser polyfill for Node.js Buffer (CSV / Node-style deps)
        buffer: 'buffer/',
      },
    },
    define: {
      global: 'globalThis',
    },
    optimizeDeps: {
      include: ['buffer'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
