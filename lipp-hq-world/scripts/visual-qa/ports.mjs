import net from "node:net";

/**
 * Porta livre escolhida pelo sistema, para o harness não colidir com um
 * processo antigo (foi exatamente isso que fez a prova de resiliência passar
 * em CI limpo e falhar aqui: um fixture velho ocupava 8642 e o "gateway
 * caído" continuava respondendo).
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("sem porta livre"))));
    });
  });
}

/** Espera uma URL responder, ou falha com o motivo. */
export async function waitForUrl(url, timeoutMs = 60000, label = url) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "sem resposta";
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timeout esperando ${label}: ${lastError}`);
}
