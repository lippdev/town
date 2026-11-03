import { useEffect } from "react";
import { useHQStore } from "@/state/useHQStore";
import { HermesAdapter } from "@/integrations/hermes/HermesAdapter";
import { botStatesFromFleet } from "@/integrations/hermes/fleetToStates";

/**
 * Liga o app ao gateway Hermes via proxy de leitura same-origin.
 *
 * O proxy responde sempre (`/api/hq/hermes/snapshot`); se o Hermes não estiver
 * de pé, a frota vem vazia com saúde `offline` e a UI diz isso — nunca finge
 * estar ao vivo. Sem proxy (build estático hospedado sem servidor), o app fica
 * em Demo, também declarado na tela.
 */
export function HermesConnection() {
  const setFleet = useHQStore((state) => state.setFleet);
  const setGatewayRefresh = useHQStore((state) => state.setGatewayRefresh);

  useEffect(() => {
    const adapter = new HermesAdapter({
      onSnapshot: (snapshot) => {
        const store = useHQStore.getState();
        store.setFleet(snapshot);
        store.setConnectionStatus(
          snapshot.health.api === "offline" && snapshot.health.dashboard === "offline"
            ? "offline"
            : snapshot.health.dashboard === "online"
              ? "online"
              : "error",
        );
        if (snapshot.bots.length > 0) {
          if (store.dataSource !== "live") {
            store.dropDemoEvents();
            store.setDataSource("live");
          }
          // estados da cena a partir da frota real (sem summary: nada inventado)
          botStatesFromFleet(snapshot).forEach(({ agentId, state }) => {
            store.setAgentState(agentId, state);
          });
        } else {
          store.setDataSource("demo");
        }
      },
      onEvent: (event) => useHQStore.getState().pushEvent(event),
      onError: () => {
        // o snapshot de erro já carrega o detalhe; aqui só garantimos o modo
        const store = useHQStore.getState();
        if (store.fleet?.bots.length) return;
        store.setDataSource("demo");
      },
    });

    setGatewayRefresh(() => adapter.refresh());
    adapter.start();
    return () => {
      adapter.dispose();
      setGatewayRefresh(null);
      setFleet(null);
    };
  }, [setFleet, setGatewayRefresh]);

  return null;
}
