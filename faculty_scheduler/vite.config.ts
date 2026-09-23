import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { getRequestListener } from '@hono/node-server';

function honoDevPlugin(): Plugin {
  return {
    name: 'hono-api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req: any, res, next) => {
        if (req.url && req.url.startsWith('/api')) {
          try {
            const { default: app } = await server.ssrLoadModule('/src/server/index.ts');
            const handler = getRequestListener(app.fetch);
            handler(req, res);
            return;
          } catch (e) {
            console.error('Error handling Hono API request:', e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal API Server Error' }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    honoDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ms-logo.jpg', 'favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'K12 Faculty Scheduler',
        short_name: 'K12 Scheduler',
        description: 'Automated Academic Faculty Timetable and Scheduling System',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/ms-logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg',
            purpose: 'any'
          },
          {
            src: '/ms-logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any'
          },
          {
            src: '/ms-logo.jpg',
            sizes: '1080x1080',
            type: 'image/jpeg',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  }
});
