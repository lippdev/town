import { useEffect } from "react";
import { AGENTS_BY_ID } from "@/agents/agents";
import { useHQStore } from "@/state/useHQStore";
import type { AgentAnimationState } from "@/types/hq";

interface DemoStep {
  /** Segundos desde o início do ciclo. */
  at: number;
  agentId: string;
  state: AgentAnimationState;
  summary: string;
}

/**
 * Cenários A–G da especificação, determinísticos e rotulados como simulação.
 * Nada aqui é apresentado como evento real: todo estado vira
 * `source: "demo"` no feed.
 */
const CYCLE: DemoStep[] = [
  { at: 1.5, agentId: "forge", state: "working", summary: "Simulação: Forge iniciou a rotina de coordenação." },
  { at: 5.0, agentId: "pulse", state: "working", summary: "Simulação: Pulse analisando atividade do GitHub." },
  { at: 5.2, agentId: "echo", state: "working", summary: "Simulação: Echo coletando sinais da comunidade." },
  { at: 9.0, agentId: "scout", state: "working", summary: "Simulação: Scout investigando oportunidades e riscos." },
  { at: 13.0, agentId: "atlas", state: "working", summary: "Simulação: Atlas cruzando evidências com o backlog." },
  { at: 17.0, agentId: "ink", state: "working", summary: "Simulação: Ink elaborando proposta de conteúdo." },
  { at: 21.5, agentId: "forge", state: "meeting", summary: "Simulação: Forge consolidando o briefing executivo." },
  { at: 25.0, agentId: "pulse", state: "idle", summary: "Simulação: Pulse concluiu a coleta." },
  { at: 25.2, agentId: "echo", state: "idle", summary: "Simulação: Echo concluiu a coleta." },
  { at: 25.4, agentId: "scout", state: "idle", summary: "Simulação: Scout concluiu a investigação." },
  { at: 25.6, agentId: "atlas", state: "idle", summary: "Simulação: Atlas concluiu a atualização." },
  { at: 25.8, agentId: "ink", state: "idle", summary: "Simulação: Ink concluiu a proposta." },
  { at: 29.0, agentId: "forge", state: "idle", summary: "Simulação: rotina encerrada." },
];

const CYCLE_LENGTH = 34;

/**
 * Roda o cenário demo em loop, com relógio próprio. Também alimenta o feed de
 * eventos da interface com a marcação de simulação.
 */
export function DemoDriver() {
  useEffect(() => {
    const store = useHQStore.getState();
    store.setDataSource("demo");
    store.setConnectionStatus("online");

    const fired = new Set<string>();
    let elapsed = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const step = (now - last) / 1000;
      last = now;

      if (useHQStore.getState().demoPaused) {
        raf = requestAnimationFrame(tick);
        return;
      }
      elapsed += step;

      if (elapsed >= CYCLE_LENGTH) {
        elapsed = 0;
        fired.clear();
      }

      for (const step of CYCLE) {
        const key = `${Math.floor(elapsed / CYCLE_LENGTH)}-${step.at}`;
        if (elapsed >= step.at && !fired.has(key)) {
          fired.add(key);
          const agent = AGENTS_BY_ID[step.agentId];
          if (!agent) continue;
          useHQStore.getState().setAgentState(step.agentId, step.state, step.summary);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
