import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';
import { cpSync, existsSync } from 'fs';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      browser: 'firefox',
      watchFilePaths: [
        'src/popup',
        'src/content/styles',
      ],
      onBundleReady() {
        const src = resolve(__dirname, 'icons');
        const dest = resolve(__dirname, 'dist/icons');
        if (existsSync(src)) {
          cpSync(src, dest, { recursive: true });
        }
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'types'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: isProduction,
  },
});
