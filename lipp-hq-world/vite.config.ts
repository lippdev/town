import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { hermesProxyMiddleware } from "./server/hermesProxy";

/**
 * Proxy de leitura do Hermes disponível no dev e no preview: `/api/hq/*`.
 * Sem ele o app continua funcionando em Demo — nunca finge estar ao vivo.
 */
function hermesProxy(): Plugin {
  const use = (server: {
    middlewares: { use: (fn: (req: unknown, res: unknown, next: () => void) => void) => void };
  }) => {
    server.middlewares.use((request, response, next) => {
      void hermesProxyMiddleware(
        request as Parameters<typeof hermesProxyMiddleware>[0],
        response as Parameters<typeof hermesProxyMiddleware>[1],
        next,
      );
    });
  };

  return {
    name: "lipp-hq-hermes-proxy",
    configureServer(server) {
      use(server);
    },
    configurePreviewServer(server) {
      use(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), hermesProxy()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    // Duas páginas independentes: o estúdio de personagens não carrega o mundo nem o Hermes.
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        personagens: fileURLToPath(new URL("./personagens.html", import.meta.url)),
      },
    },
  },
});
