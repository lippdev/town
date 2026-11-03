import { useEffect } from "react";
import { OpenMausBotAdapter } from "@/integrations/openmausbot/OpenMausBotAdapter";
import { useHQStore } from "@/state/useHQStore";

/**
 * Liga o modo Live ao proxy de leitura quando a variável de build
 * `VITE_HQ_PROXY` está definida. Sem proxy configurado, a aplicação fica em
 * Demo e diz isso — nunca finge que está ao vivo.
 */
export function LiveConnection() {
  const proxy = import.meta.env.VITE_HQ_PROXY as string | undefined;

  useEffect(() => {
    if (!proxy) return;
    const adapter = new OpenMausBotAdapter({
      baseUrl: proxy,
      onEvent: (event) => useHQStore.getState().pushEvent(event),
      onState: (agentId, activity) => {
        const state =
          activity === "working"
            ? "working"
            : activity === "waiting-on-you"
              ? "blocked"
              : activity === "idle"
                ? "idle"
                : activity === "no-signal" || activity === "dead"
                  ? "offline"
                  : null;
        if (state) useHQStore.getState().setAgentState(agentId, state);
      },
      onStatus: (status) => useHQStore.getState().setConnectionStatus(status),
    });
    useHQStore.getState().setDataSource("live");
    adapter.start();
    return () => adapter.dispose();
  }, [proxy]);

  return null;
}
