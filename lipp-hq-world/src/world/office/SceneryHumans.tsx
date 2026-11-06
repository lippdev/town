import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { HumanFigure, loadHumanBase, type HumanBase } from "@/avatar/human/HumanFigure";
import { resolveHuman } from "@/avatar/human/preset";
import { HumanActor } from "./HumanActor";
import { FloorGroup } from "./BuildingScene";
import { sceneryOfView, type FloorId } from "./officeBuilding";
import type { SceneryHuman } from "./officeLobby";
import { sceneryActors, useOfficeStore } from "./officeStore";

function SceneryBody({ person, base, reduced }: { person: SceneryHuman; base: HumanBase; reduced: boolean }) {
  const [actor, setActor] = useState<HumanActor | null>(null);
  useEffect(() => {
    const figure = new HumanFigure(base, { phase: person.spot.x });
    const created = new HumanActor(figure, { spot: person.spot, chair: person.chair }, { walkSpeed: base.clips.walkSpeed }, reduced);
    if (person.chair) created.settle("seated");
    else figure.play("idle", { instant: true, frozen: reduced });
    void figure.wear(resolveHuman(person.preset));
    sceneryActors.set(person.id, created);
    setActor(created);
    return () => {
      sceneryActors.delete(person.id);
      figure.dispose();
      setActor(null);
    };
  }, [base, person, reduced]);
  useFrame((_, delta) => actor?.update(delta));
  return actor ? <primitive object={actor.holder} name={`cenario-${person.id}`} /> : null;
}

/**
 * Gente que só compõe a cena do andar: fica fora de Pessoas e do clique, e nada manda nela.
 * Ninguém aqui sai de onde está; se um dia precisar agir, deixa de ser cenário.
 */
export function SceneryHumans() {
  const view = useOfficeStore((state) => state.buildingView);
  const mounted = useOfficeStore((state) => state.mountedFloors);
  const [base, setBase] = useState<HumanBase | null>(null);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Carrega antes de precisar: quem entra no andar não vê a cena sem ninguém.
  useEffect(() => {
    if (base) return;
    let alive = true;
    loadHumanBase().then(
      (loaded) => {
        if (alive) setBase(loaded);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [view, base]);
  if (!base) return null;
  return (
    <>
      {mounted.map((floor: FloorId) => (
        <FloorGroup key={floor} floor={floor}>
          {sceneryOfView(floor).map((person) => (
            <SceneryBody key={person.id} person={person} base={base} reduced={reduced} />
          ))}
        </FloorGroup>
      ))}
    </>
  );
}
