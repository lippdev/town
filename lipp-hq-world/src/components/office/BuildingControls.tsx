import { Building2 } from "lucide-react";
import { FLOOR_LABEL, FLOOR_LEVEL, FLOOR_ORDER, type BuildingView } from "@/world/office/officeBuilding";
import { useOfficeStore } from "@/world/office/officeStore";

/**
 * O seletor de andares, como um painel de elevador. Discreto e só na demonstração: a frota
 * real não tem prédio. O atalho PageUp/PageDown faz o mesmo. A troca é direta:
 * o andar novo aparece no próximo quadro, sem escuro nem espera.
 */
export function FloorSelector() {
  const view = useOfficeStore((state) => state.buildingView);
  const go = (next: BuildingView) => useOfficeStore.getState().goToView(next);
  return (
    <nav className="office-floors" aria-label="Andares do prédio" data-floor-selector>
      <button type="button" className="office-floor exterior" aria-current={view === "exterior" ? "true" : undefined} data-view="exterior" title="Ver o prédio por fora" aria-label="Exterior do prédio" onClick={() => go("exterior")}>
        <Building2 size={15} aria-hidden />
        <span>Exterior</span>
      </button>
      {FLOOR_ORDER.map((floor) => (
        <button key={floor} type="button" className="office-floor" aria-current={view === floor ? "true" : undefined} data-view={floor} title={FLOOR_LABEL[floor].name} aria-label={`Andar ${FLOOR_LABEL[floor].name}`} onClick={() => go(floor)} style={{ order: -FLOOR_LEVEL[floor] }}>
          <b aria-hidden>{FLOOR_LABEL[floor].short}</b>
          <span>{FLOOR_LABEL[floor].name}</span>
        </button>
      ))}
    </nav>
  );
}
