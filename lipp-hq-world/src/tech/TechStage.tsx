import { useEffect, useMemo, useRef } from "react";
import { Moon } from "lucide-react";
import { doingNow, epicHealth, HEALTH_LABEL, whereIs } from "@/activity/selectors";
import { BOT_TASK_LABEL } from "@/activity/types";
import { worldToScreen } from "@/world/office/officeCamera";
import { humanActors, officeRuntime, useOfficeStore } from "@/world/office/officeStore";
import { BOARD, TECH_FLOOR_ID, boardCards } from "./techPlaces";
import { squadHumanId } from "./techPeople";
import { techSceneRuntime } from "./TechScene";
import { useTechStore } from "./techStore";
import "./tech.css";

const BOT_NAME: Record<string, string> = { forge: "Forge", pulse: "Pulse", atlas: "Atlas" };

/**
 * Etiquetas do andar da Tecnologia, em HTML sobre a cena, como as do escritório: texto nítido e
 * botões de verdade. O rótulo de cada pessoa só aparece apontando, selecionando ou com foco do
 * teclado; o "não perturbe" de quem está em foco fica sempre, porque é um aviso.
 */
export function TechStage() {
  const view = useOfficeStore((state) => state.buildingView);
  const shown = useOfficeStore((state) => state.shownFloor);
  const traveling = useOfficeStore((state) => state.traveling);
  const hovered = useOfficeStore((state) => state.hoveredHumanId);
  const selected = useOfficeStore((state) => state.selectedHumanId);
  const state = useTechStore((store) => store.state);
  const plans = useTechStore((store) => store.people);
  const visits = useTechStore((store) => store.visits);
  const selectedEpicId = useTechStore((store) => store.selectedEpicId);
  const cards = useMemo(() => boardCards(state), [state]);
  const layer = useRef<HTMLDivElement | null>(null);
  const here = view === TECH_FLOOR_ID && shown === TECH_FLOOR_ID;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const root = layer.current;
      if (!root) return;
      const { view: camera, viewport } = officeRuntime;
      for (const node of root.querySelectorAll<HTMLElement>("[data-squad-tag]")) {
        const id = node.dataset.squadTag!;
        const anchor = officeRuntime.liveAnchors.get(id);
        const actor = humanActors.get(id);
        const visible = Boolean(anchor && actor?.holder.visible);
        node.style.display = visible ? "" : "none";
        if (!anchor || !visible) continue;
        const point = worldToScreen(anchor, camera, viewport);
        node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
      for (const node of root.querySelectorAll<HTMLElement>("[data-bot-visit]")) {
        const robot = techSceneRuntime.robots.get(node.dataset.botVisit!);
        node.style.display = robot && !robot.gone ? "" : "none";
        if (!robot || robot.gone) continue;
        const point = worldToScreen([robot.x, robot.y + 0.1, robot.z], camera, viewport);
        node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
      for (const node of root.querySelectorAll<HTMLElement>("[data-epic-card]")) {
        const x = Number(node.dataset.x);
        const y = Number(node.dataset.y);
        const w = Number(node.dataset.w) / 2;
        const h = Number(node.dataset.h) / 2;
        const corners = [[x - w, y - h], [x + w, y - h], [x - w, y + h], [x + w, y + h]].map(([cx, cy]) => worldToScreen([cx!, cy!, BOARD.z], camera, viewport));
        const left = Math.min(...corners.map((point) => point.x));
        const top = Math.min(...corners.map((point) => point.y));
        node.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
        node.style.width = `${(Math.max(...corners.map((point) => point.x)) - left).toFixed(1)}px`;
        node.style.height = `${(Math.max(...corners.map((point) => point.y)) - top).toFixed(1)}px`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!here) return null;
  return (
    <div className="tech-labels" ref={layer} data-traveling={traveling ? "true" : undefined} data-tech-stage>
      {cards.map((card) => {
        const epic = state.epics.find((item) => item.id === card.epicId)!;
        const health = epicHealth(state, epic.id);
        return (
          <button
            key={card.epicId}
            type="button"
            className={selectedEpicId === epic.id ? "tech-epic-card active" : "tech-epic-card"}
            data-epic-card={epic.id}
            data-health={health.level}
            data-x={card.x}
            data-y={card.y}
            data-w={card.width}
            data-h={card.height}
            aria-label={`Épico ${epic.id}, ${epic.title}: ${HEALTH_LABEL[health.level]}`}
            title={`${epic.id} · ${epic.title} · ${HEALTH_LABEL[health.level]}`}
            onClick={() => {
              useOfficeStore.getState().clearHuman();
              useTechStore.getState().selectEpic(epic.id);
            }}
          />
        );
      })}
      {plans.map((plan) => {
        const id = squadHumanId(plan.email);
        const person = state.people.find((item) => item.email === plan.email)!;
        const focus = whereIs(state, plan.email).kind === "foco";
        const active = hovered === id || selected === id;
        const doing = plan.heading ?? doingNow(state, plan.email);
        return (
          <div key={id} className="tech-person" data-squad-tag={id}>
            {focus && (
              <span className="tech-dnd" data-dnd={plan.email} title={`${person.name} em foco: não perturbe`} aria-hidden>
                <Moon size={11} />
              </span>
            )}
            <button
              type="button"
              className={active ? "tech-person-tag active" : "tech-person-tag"}
              data-squad-person={plan.email}
              aria-label={`${person.name}: ${doing}`}
              onClick={() => useOfficeStore.getState().selectHuman(id)}
            >
              <strong>{person.name.split(" ")[0]}</strong>
              <em data-doing>{doing}</em>
            </button>
          </div>
        );
      })}
      {visits.map((visit) => {
        const task = state.botTasks.find((item) => item.id === visit.taskId);
        return (
          <span key={visit.taskId} className="tech-bot-tag" data-bot-visit={visit.taskId}>
            <strong>{BOT_NAME[visit.botId] ?? visit.botId}</strong> {task ? (visit.done ? "pronto" : BOT_TASK_LABEL[task.kind].toLocaleLowerCase("pt-BR")) : ""}
          </span>
        );
      })}
    </div>
  );
}

export default TechStage;
