import { Building2, CornerLeftUp, Moon } from "lucide-react";
import { FLOOR_LABEL, FLOOR_LEVEL, FLOOR_ORDER, HIDEOUT, type BuildingView } from "@/world/office/officeBuilding";
import { EXPANSION_FLOORS, expansionFloor } from "@/world/office/officeExpansion";
import { useSecretStore } from "@/world/office/officeSecrets";
import { useOfficeStore } from "@/world/office/officeStore";

const MAIN_FLOORS = FLOOR_ORDER.filter((floor) => !expansionFloor(floor));

/**
 * O seletor de andares, como um painel de elevador. Discreto e só na demonstração: a frota
 * real não tem prédio. O atalho PageUp/PageDown faz o mesmo. A cena leva o caminho até lá sem
 * sair da tela, e o painel já responde na hora: pedir outro andar no meio redireciona.
 */
export function FloorSelector() {
  const view = useOfficeStore((state) => state.buildingView);
  const go = (next: BuildingView) => useOfficeStore.getState().goToView(next);
  const expansions = [...EXPANSION_FLOORS].sort((a, b) => b.level - a.level);
  // O esconderijo só entra no painel depois de achado, e o painel esquece com a página.
  const found = useSecretStore((state) => state.found);
  const hidden = view === HIDEOUT;
  // As duas linhas entram no fim do painel: nenhuma outra sai de baixo do ponteiro quando elas somem.
  return (
    <nav className="office-floors" aria-label="Andares do prédio" data-floor-selector>
      {hidden && (
        <button type="button" className="office-floor office-floor-back" data-hideout-exit title="Subir pela passagem até a Diretoria" aria-label="Voltar à Diretoria" onClick={() => go("diretoria")} style={{ order: 2 }}>
          <CornerLeftUp size={15} aria-hidden />
          <span>Voltar à Diretoria</span>
        </button>
      )}
      <button type="button" className="office-floor exterior" aria-current={view === "exterior" ? "true" : undefined} data-view="exterior" title="Ver o prédio por fora" aria-label="Exterior do prédio" onClick={() => go("exterior")}>
        <Building2 size={15} aria-hidden />
        <span>Exterior</span>
      </button>
      {MAIN_FLOORS.map((floor) => (
        <button key={floor} type="button" className="office-floor" aria-current={view === floor ? "true" : undefined} data-view={floor} title={FLOOR_LABEL[floor].name} aria-label={`Andar ${FLOOR_LABEL[floor].name}`} onClick={() => go(floor)} style={{ order: -FLOOR_LEVEL[floor] }}>
          <b aria-hidden>{FLOOR_LABEL[floor].short}</b>
          <span>{FLOOR_LABEL[floor].name}</span>
        </button>
      ))}
      {found && (
        <button type="button" className="office-floor office-floor-secret" aria-current={hidden ? "true" : undefined} data-view={HIDEOUT} title="O esconderijo atrás da estante" aria-label="Esconderijo" onClick={() => go(HIDEOUT)} style={{ order: 1 }}>
          <Moon size={14} aria-hidden />
          <span>Esconderijo</span>
        </button>
      )}
      {/* Os andares reservados dividem uma linha: quatro botões a mais, sem o painel crescer quatro linhas. */}
      <div className="office-floor-group" role="group" aria-label="Andares de expansão" style={{ order: -expansions[0]!.level }}>
        <span aria-hidden>Expansão</span>
        <div>
          {expansions.map((floor) => (
            <button key={floor.id} type="button" className="office-floor mini" aria-current={view === floor.id ? "true" : undefined} data-view={floor.id} title={`${floor.title} · cenário simulado`} aria-label={`Andar ${floor.title}`} onClick={() => go(floor.id)}>
              <b aria-hidden>{floor.level}</b>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
