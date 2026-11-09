import { useEffect, type CSSProperties } from "react";
import { ChevronDown, PersonStanding } from "lucide-react";
import { useOfficeStore } from "@/world/office/officeStore";
import { personTopColor, squadHumanId } from "./techPeople";
import { dailyAttendance } from "@/activity/selectors";
import { formatSquadStatus, matchesSquadPerson } from "./techRosterStatus";
import { useTechStore } from "./techStore";

export interface TechRosterSectionProps {
  matches: (text: string) => boolean;
  searching: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onMatchesChange?: (count: number | null) => void;
}

/**
 * Seção "Tecnologia · squad" na barra lateral: as 8 pessoas do squad simulado
 * com estado agora em tempo real pelo relógio da simulação.
 */
export function TechRosterSection({ matches, searching, collapsed, onToggle, onSelect, onMatchesChange }: TechRosterSectionProps) {
  const state = useTechStore((store) => store.state);
  const selectedHumanId = useOfficeStore((store) => store.selectedHumanId);

  const people = state.people.filter((person) => matchesSquadPerson(person, matches));
  const daily = dailyAttendance(state);

  useEffect(() => {
    onMatchesChange?.(searching ? people.length : null);
    return () => {
      onMatchesChange?.(null);
    };
  }, [onMatchesChange, searching, people.length]);

  if (searching && people.length === 0) {
    return null;
  }

  const selectPerson = (email: string) => {
    if (useTechStore.getState().view !== "predio") {
      useTechStore.getState().setView("predio");
    }
    useOfficeStore.getState().selectHuman(squadHumanId(email));
    onSelect();
  };

  return (
    <section className="office-roster-section" aria-label="Tecnologia · squad" data-roster-section="tecnologia-squad">
      <h2 className="office-section-title">
        <button
          type="button"
          className="office-section-toggle"
          aria-expanded={!collapsed}
          disabled={searching}
          onClick={onToggle}
        >
          <span className="office-section-name">
            Tecnologia · squad{" "}
            <span className="office-chip tech-chip" title="Squad fictício e dia simulado: nenhum dado real">
              Simulação
            </span>{" "}
            <small>{people.length}</small>
          </span>
          <ChevronDown size={14} aria-hidden />
        </button>
      </h2>
      <div className="office-section-body" data-collapsed={collapsed} inert={collapsed}>
        <div className="office-team-list">
          {people.map((person) => {
            const status = formatSquadStatus(state, person.email, daily);
            const active = selectedHumanId === squadHumanId(person.email);
            const color = personTopColor(person.email);
            return (
              <button
                key={person.email}
                type="button"
                className={active ? "office-roster-bot tech-squad-bot active" : "office-roster-bot tech-squad-bot"}
                data-squad-row={person.email}
                data-squad-member={person.email}
                data-where={status.whereKind}
                data-state={status.whereKind}
                data-daily={status.daily ?? undefined}
                aria-pressed={active}
                title={`${person.name} · ${person.title} · ${status.ariaLabel}`}
                onClick={() => selectPerson(person.email)}
              >
                <span className="office-agent-avatar" style={{ "--agent-color": color } as CSSProperties} aria-hidden>
                  <PersonStanding size={22} />
                </span>
                <span className="office-roster-name tech-squad-meta">
                  <span className="tech-squad-top">
                    <strong className="tech-squad-name">{person.name}</strong>
                    <small className="tech-squad-role">{person.title}</small>
                  </span>
                  <span className="office-roster-state tech-squad-state" data-state={status.whereKind} aria-label={status.ariaLabel}>
                    {status.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default TechRosterSection;
