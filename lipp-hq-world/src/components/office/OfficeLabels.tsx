import { useEffect, useRef } from "react";
import { useHQStore } from "@/state/useHQStore";
import { stateLabel } from "@/components/hud/fleetView";
import { CHIEF_ID, CHIEF_STATUS_LABEL } from "@/world/office/officeChief";
import { BUILDING_ROOMS_BY_ID, FACADE_BOUNDS, FLOOR_LABEL, STORY, floorAtLevel, viewRooms } from "@/world/office/officeBuilding";
import { ENTRANCE, OFFICE_SEATS_BY_ID } from "@/world/office/officeLayout";
import { boxSilhouette, worldToScreen, type OfficeView } from "@/world/office/officeCamera";
import { officeRuntime, useOfficeStore } from "@/world/office/officeStore";

type Anchor = readonly [number, number, number];

/** Quando os rótulos dos postos extras aparecem: de longe eles se atropelariam. */
const EXTRA_TAG_ZOOM = 60;

/**
 * Rótulos em HTML sobre o canvas: texto nítido em qualquer zoom e botões de verdade,
 * alcançáveis pelo teclado. Um só laço reposiciona todos, sem renderizar o React.
 */
export function OfficeLabels() {
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const hoveredRoomId = useOfficeStore((state) => state.hoveredRoomId);
  const hoveredBotId = useOfficeStore((state) => state.hoveredBotId);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const mode = useOfficeStore((state) => state.mode);
  const humans = useOfficeStore((state) => state.humans);
  const chiefStatus = useOfficeStore((state) => state.chiefStatus);
  const selectedHumanId = useOfficeStore((state) => state.selectedHumanId);
  const hoveredHumanId = useOfficeStore((state) => state.hoveredHumanId);
  const buildingView = useOfficeStore((state) => state.buildingView);
  const pendingView = useOfficeStore((state) => state.pendingView);
  const hoveredLevel = useOfficeStore((state) => state.hoveredLevel);
  const hoveredFloor = hoveredLevel === null ? null : floorAtLevel(hoveredLevel);
  const nodes = useRef(new Map<HTMLElement, Anchor>());
  const liveNodes = useRef(new Map<string, HTMLElement>());
  /** Para onde a etiqueta aponta enquanto o corpo não carregou ou não existe. */
  const liveFallback = useRef(new Map<string, Anchor>());
  const layer = useRef<HTMLDivElement | null>(null);
  const shade = useRef<HTMLDivElement | null>(null);

  const place = (anchor: Anchor) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(node, anchor);
    else for (const [key] of nodes.current) if (!key.isConnected) nodes.current.delete(key);
  };

  useEffect(() => {
    let frame = 0;
    let last: OfficeView = { x: NaN, z: NaN, zoom: NaN };
    let lastCount = -1;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const { view, viewport } = officeRuntime;
      // Quem se mexe é reposicionado a cada quadro; o resto só quando a câmera muda.
      for (const [id, node] of liveNodes.current) {
        const anchor = officeRuntime.liveAnchors.get(id) ?? liveFallback.current.get(id);
        if (!anchor) continue;
        const point = worldToScreen(anchor, view, viewport);
        node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
      const count = nodes.current.size;
      if (view.x === last.x && view.z === last.z && view.zoom === last.zoom && count === lastCount && !layer.current?.dataset.dirty) return;
      last = { ...view };
      lastCount = count;
      if (layer.current) {
        delete layer.current.dataset.dirty;
        layer.current.dataset.far = view.zoom < EXTRA_TAG_ZOOM ? "true" : "false";
      }
      const focused = useOfficeStore.getState().focusedRoomId;
      if (shade.current && focused) {
        // Um furo com a silhueta da sala: o resto do andar recua, sem nenhum custo na cena.
        const outline = boxSilhouette(BUILDING_ROOMS_BY_ID[focused]!.bounds, view, viewport)
          .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
          .join(" ");
        shade.current.style.clipPath = `path(evenodd, "M0 0H${viewport.width}V${viewport.height}H0Z ${outline}Z")`;
      }
      for (const [node, anchor] of nodes.current) {
        const point = worldToScreen(anchor, view, viewport);
        // O holograma identifica o centro da sala; o nome do bot fica acima da cabeça.
        const centered = node.dataset.bot === undefined;
        node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, ${centered ? "-50%" : "-100%"})`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (layer.current) layer.current.dataset.dirty = "true";
  });

  return (
    <div className="office-labels" ref={layer} data-switching={pendingView !== null}>
      <div className={focusedRoomId ? "office-shade on" : "office-shade"} ref={shade} aria-hidden />
      {viewRooms(buildingView).map((room) => {
        // Só o local apontado revela a identificação sobre a cena.
        const classes = room.id === hoveredRoomId ? "office-room-tag hovered" : "office-room-tag";
        return (
          <button
            key={room.id}
            type="button"
            ref={place([room.center.x, 1.5, room.center.z])}
            className={classes}
            style={{ "--tag-color": room.color } as React.CSSProperties}
            data-room={room.id}
            onClick={() => useOfficeStore.getState().focusRoom(room.id)}
          >
            <strong>{room.name}</strong>
            <span>Explorar sala</span>
          </button>
        );
      })}
      {buildingView === "operacao" && bots.map((bot) => {
        const seat = OFFICE_SEATS_BY_ID[seating.seats[bot.id] ?? ""];
        if (!seat) return null;
        const active = bot.id === selectedBotId || bot.id === hoveredBotId;
        const elsewhere = focusedRoomId !== null && seat.roomId !== focusedRoomId;
        const classes = ["office-bot-tag", active ? "active" : "", seat.kind === "posto" ? "" : "extra", elsewhere ? "elsewhere" : ""].filter(Boolean).join(" ");
        return (
          <button
            key={bot.id}
            type="button"
            ref={(node) => {
              if (node) {
                liveNodes.current.set(bot.id, node);
                liveFallback.current.set(bot.id, [seat.x, 2.2, seat.z]);
              } else {
                liveNodes.current.delete(bot.id);
                liveFallback.current.delete(bot.id);
              }
            }}
            className={classes}
            style={{ "--tag-color": bot.color } as React.CSSProperties}
            data-bot={bot.id}
            aria-label={`${bot.name}, ${bot.role}`}
            onClick={() => useOfficeStore.getState().selectBot(bot.id)}
          >
            {mode === "live" && bot.state && <span className={`bot-state-dot bot-state-${bot.state}`} aria-hidden />}
            <strong>{bot.name}</strong>
            {mode === "live" && bot.state && focusedRoomId === seat.roomId && <em>{stateLabel(bot.state)}</em>}
          </button>
        );
      })}
      {humans.filter((human) => human.floor === buildingView).map((human) => {
        const active = human.id === selectedHumanId || human.id === hoveredHumanId;
        return (
          <button
            key={human.id}
            type="button"
            ref={(node) => {
              if (node) liveNodes.current.set(human.id, node);
              else liveNodes.current.delete(human.id);
            }}
            className={["office-bot-tag", "office-human-tag", active ? "active" : "", humans.length > 2 ? "extra" : "", focusedRoomId && focusedRoomId !== human.roomId ? "elsewhere" : ""].filter(Boolean).join(" ")}
            style={{ "--tag-color": "#94a3b8" } as React.CSSProperties}
            data-human={human.id}
            aria-label={`${human.name}, pessoa`}
            onClick={() => useOfficeStore.getState().selectHuman(human.id)}
          >
            <strong>{human.name}</strong>
            {human.id === CHIEF_ID && <span className={chiefStatus === "reuniao" ? "office-chief-status busy" : "office-chief-status"}>{CHIEF_STATUS_LABEL[chiefStatus]}</span>}
          </button>
        );
      })}
      {mode === "live" && !focusedRoomId && (
        <span className="office-entrance-tag" ref={place([ENTRANCE.x + 0.2, 0.02, ENTRANCE.z + 2.6])}>
          Entrada
        </span>
      )}
      {buildingView === "exterior" && hoveredFloor && (
        <span className="office-floor-tag" aria-hidden ref={place([FACADE_BOUNDS.maxX, (hoveredLevel! + 0.5) * STORY, FACADE_BOUNDS.maxZ])}>
          {FLOOR_LABEL[hoveredFloor].name}
        </span>
      )}
    </div>
  );
}
