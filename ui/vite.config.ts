import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import type { ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.NULLHUB_API_TARGET || 'http://127.0.0.1:19800';

function createLocalApiProxy(): ProxyOptions {
  return {
    target: apiTarget,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => {
        // Keep local dev requests same-origin from the browser's perspective.
        proxyReq.removeHeader('origin');
      });
    }
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.unit.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          setupFiles: ['vitest-browser-svelte'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  },
  server: {
    proxy: {
      '/api': createLocalApiProxy()
    }
  },
  preview: {
    proxy: {
      '/api': createLocalApiProxy()
    }
  }
});
