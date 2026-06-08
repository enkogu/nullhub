import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type ProxyOptions } from 'vite';

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
