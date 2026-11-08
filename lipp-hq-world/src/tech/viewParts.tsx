import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ActivityState } from "@/activity/events";
import { HEALTH_LABEL, type HealthLevel, type HealthReason } from "@/activity/selectors";
import { clockLabel } from "@/activity/time";
import type { Subject } from "@/activity/types";
import { useHQStore } from "@/state/useHQStore";
import { escapeLayers, useOfficeStore } from "@/world/office/officeStore";
import { squadHumanId } from "./techPeople";
import { HEALTH_COLOR } from "./techPlaces";
import { useTechStore } from "./techStore";
import { destinationOf, type Destination, type PersonTag } from "./techViews";
import "./tech-views.css";

/** Pedaços comuns às visões Projetos e Painel: ir até a origem, o Esc, saúde, pessoa e cabeçalho. */
// ─── Navegar até a origem ───────────────────────────────────────────────────

/** Quem abriu a gaveta a partir de uma visão: o foco volta para ele quando ela fecha. */
let opener: HTMLElement | null = null;
export function takeOpener(): HTMLElement | null {
  const element = opener;
  opener = null;
  return element;
}

/** Abre a gaveta que o prédio já tem: a do épico (com a HU em destaque) ou a da pessoa. */
export function openDestination(destination: Destination | null) {
  if (!destination) return;
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (active instanceof HTMLElement && active.closest("[data-tech-view]")) opener = active;
  if (destination.kind === "epic") {
    useHQStore.getState().clearSelection();
    useOfficeStore.getState().clearHuman();
    useTechStore.getState().selectEpic(destination.epicId, destination.storyId);
  } else {
    useOfficeStore.getState().selectHuman(squadHumanId(destination.email));
  }
}

export const openSubject = (state: ActivityState, subject: Subject) => openDestination(destinationOf(state, subject));
export const openPerson = (email: string) => openDestination({ kind: "person", email });

/** Uma gaveta aberta fecha antes de a visão trocar: o Esc sai de dentro para fora. */
const drawerOpen = () => Boolean(useTechStore.getState().selectedEpicId || useHQStore.getState().selectedBotId || useOfficeStore.getState().selectedHumanId);

export function closeViewLayer(): boolean {
  const store = useTechStore.getState();
  if (store.view === "predio" || drawerOpen()) return false;
  store.setView("predio");
  return true;
}

/**
 * O Esc de quem está com o foco dentro de uma visão (a cena não ouve teclas ali): primeiro as
 * camadas do escritório (gaveta do épico, depois a visão), depois a gaveta de bot ou pessoa.
 */
export function escapeFromView(event: ReactKeyboardEvent) {
  if (event.key !== "Escape" || document.querySelector("[data-account-menu]")) return;
  event.preventDefault();
  if ([...escapeLayers].some((close) => close())) return;
  if (useHQStore.getState().selectedBotId) useHQStore.getState().clearSelection();
  else if (useOfficeStore.getState().selectedHumanId) useOfficeStore.getState().clearHuman();
}

// ─── Pedaços ─────────────────────────────────────────────────────────────────

export function HealthBadge({ level }: { level: HealthLevel }) {
  return (
    <span className={`tv-health tv-health-${level}`} data-health={level}>
      <span className="tv-dot" style={{ background: HEALTH_COLOR[level] }} aria-hidden />
      {HEALTH_LABEL[level]}
    </span>
  );
}

/** O nome de quem é responsável; quem está fora vem marcado com o motivo. */
export function Who({ person, empty = "sem responsável" }: { person: PersonTag | null; empty?: string }) {
  if (!person) return <span className="tv-dim">{empty}</span>;
  return (
    <button type="button" className="tv-person" data-person={person.email} data-away={person.away ? "true" : undefined} onClick={() => openPerson(person.email)} title={person.away ? `${person.name} está fora: ${person.away}` : `Abrir ${person.name}`}>
      {person.name}
      {person.away && <em className="tv-away">{person.away}</em>}
    </button>
  );
}

export function Flag({ tone, children, title, data }: { tone: "red" | "amber" | "dim"; children: ReactNode; title?: string; data?: Record<string, string> }) {
  return (
    <span className={`tv-flag tv-flag-${tone}`} title={title} {...data}>
      {children}
    </span>
  );
}

/** O motivo do épico em poucas palavras, na linha da HU. O texto inteiro fica no title. */
export function riskLabel(reason: HealthReason): string {
  const pr = reason.subject.kind === "pr" ? `#${reason.subject.number}` : "";
  switch (reason.kind) {
    case "ci-quebrado":
      return `CI quebrado no ${pr}`;
    case "pr-sem-revisao":
      return `${pr} sem revisão`;
    case "responsavel-fora":
      return "Responsável fora";
    default:
      return reason.text;
  }
}

export function useNow() {
  return useTechStore((store) => store.state);
}

export function ViewHead({ title, children, tools }: { title: string; children: ReactNode; tools?: ReactNode }) {
  const at = useTechStore((store) => store.state.at);
  return (
    <header className="tv-head">
      <div className="tv-head-text">
        <h2>{title}</h2>
        <p>
          {children} · <span data-view-clock>{clockLabel(at)}</span>, ao vivo com o relógio da simulação
        </p>
      </div>
      {tools && <div className="tv-tools">{tools}</div>}
    </header>
  );
}
