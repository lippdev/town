import type { ActivityState } from "@/activity/events";
import { whereIs, PLACE_LABEL, type PlaceKind } from "@/activity/selectors";
import { clockLabel } from "@/activity/time";
import { ROLE_LABEL, type Person } from "@/activity/types";

export interface SquadStatusInfo {
  whereKind: PlaceKind;
  label: string;
  ariaLabel: string;
}

/** Formata o estado de uma pessoa do squad para a barra lateral em poucas palavras. */
export function formatSquadStatus(state: ActivityState, email: string): SquadStatusInfo {
  const where = whereIs(state, email);
  switch (where.kind) {
    case "mesa":
      return {
        whereKind: "mesa",
        label: PLACE_LABEL.mesa,
        ariaLabel: PLACE_LABEL.mesa,
      };
    case "foco":
      return {
        whereKind: "foco",
        label: `${PLACE_LABEL.foco} 🌙`,
        ariaLabel: `${PLACE_LABEL.foco} (não perturbe)`,
      };
    case "reuniao": {
      const meeting = where.meeting;
      const until = where.until ? ` até ${clockLabel(where.until)}` : "";
      const text = meeting ? `${PLACE_LABEL.reuniao} · ${meeting.title}${until}` : PLACE_LABEL.reuniao;
      return {
        whereKind: "reuniao",
        label: text,
        ariaLabel: text,
      };
    }
    case "chamada": {
      const meeting = where.meeting;
      const until = where.until ? ` até ${clockLabel(where.until)}` : "";
      const text = meeting ? `${PLACE_LABEL.chamada} · ${meeting.title}${until}` : PLACE_LABEL.chamada;
      return {
        whereKind: "chamada",
        label: text,
        ariaLabel: text,
      };
    }
    case "huddle":
      return {
        whereKind: "huddle",
        label: PLACE_LABEL.huddle,
        ariaLabel: PLACE_LABEL.huddle,
      };
    case "fora": {
      const statusText = state.slackStatus[email]?.text;
      const isVacation = statusText ? /férias|vacation/i.test(statusText) : false;
      const label = isVacation ? "Férias" : statusText ? (statusText.charAt(0).toUpperCase() + statusText.slice(1)) : "Fora";
      return {
        whereKind: "fora",
        label,
        ariaLabel: label,
      };
    }
  }
}

/** Filtra a pessoa por nome e papel (título, papel e abreviação). */
export function matchesSquadPerson(person: Person, matches: (text: string) => boolean): boolean {
  const roleLabel = ROLE_LABEL[person.role] ?? "";
  const candidate = `${person.name} ${person.title} ${roleLabel} ${person.role}`;
  return matches(candidate);
}
