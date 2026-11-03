import { useEffect } from "react";
import { primeGatewayStatus } from "@/integrations/hermes/gatewayStatus";
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
  const setFleetSnapshot = useHQStore((state) => state.setFleetSnapshot);
  const setGatewayRefresh = useHQStore((state) => state.setGatewayRefresh);

  useEffect(() => {
    // a configuração do gateway é lida uma vez no boot: a aba de diagnóstico
    // não pode abrir em branco enquanto a requisição acontece.
    primeGatewayStatus();
    const adapter = new HermesAdapter({
      onSnapshot: (snapshot) => {
        const store = useHQStore.getState();
        store.setFleetSnapshot(snapshot);
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
      setFleetSnapshot(null);
    };
  }, [setFleetSnapshot, setGatewayRefresh]);

  return null;
}
