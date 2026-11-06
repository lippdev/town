import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { FLOOR_LABEL, FLOOR_LEVEL, FLOOR_ORDER, type BuildingView } from "@/world/office/officeBuilding";
import { useOfficeStore } from "@/world/office/officeStore";

/** Até o escuro cobrir a cena; depois disso a troca já não aparece. */
const FADE_MS = 170;

/**
 * O seletor de andares, como um painel de elevador. Discreto e só na demonstração: a frota
 * real não tem prédio. O atalho PageUp/PageDown faz o mesmo.
 */
export function FloorSelector() {
  const view = useOfficeStore((state) => state.buildingView);
  const pending = useOfficeStore((state) => state.pendingView);
  const current = pending ?? view;
  const go = (next: BuildingView) => useOfficeStore.getState().goToView(next);
  return (
    <nav className="office-floors" aria-label="Andares do prédio" data-floor-selector>
      <button type="button" className="office-floor exterior" aria-current={current === "exterior" ? "true" : undefined} data-view="exterior" title="Ver o prédio por fora" aria-label="Exterior do prédio" onClick={() => go("exterior")}>
        <Building2 size={15} aria-hidden />
        <span>Exterior</span>
      </button>
      {FLOOR_ORDER.map((floor) => (
        <button key={floor} type="button" className="office-floor" aria-current={current === floor ? "true" : undefined} data-view={floor} title={FLOOR_LABEL[floor].name} aria-label={`Andar ${FLOOR_LABEL[floor].name}`} onClick={() => go(floor)} style={{ order: -FLOOR_LEVEL[floor] }}>
          <b aria-hidden>{FLOOR_LABEL[floor].short}</b>
          <span>{FLOOR_LABEL[floor].name}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * A troca de andar: escurece, troca o que está montado e clareia. Com movimento reduzido, ou
 * sem andar pedido, não há escuro nenhum. Nada de outro andar aparece nem no meio do caminho.
 */
export function FloorFade() {
  const pending = useOfficeStore((state) => state.pendingView);
  const [dark, setDark] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    if (!pending) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      useOfficeStore.getState().commitView();
      return;
    }
    setDark(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      useOfficeStore.getState().commitView();
      // Dois quadros para o andar novo chegar à tela antes de clarear.
      requestAnimationFrame(() => requestAnimationFrame(() => setDark(false)));
    }, FADE_MS);
    return () => window.clearTimeout(timer.current);
  }, [pending]);
  return <div className={dark ? "office-floor-fade on" : "office-floor-fade"} aria-hidden data-floor-fade={dark} />;
}
