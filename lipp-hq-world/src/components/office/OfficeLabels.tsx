import { useEffect, useRef } from "react";
import { useHQStore } from "@/state/useHQStore";
import { stateLabel } from "@/components/hud/fleetView";
import { ENTRANCE, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID } from "@/world/office/officeLayout";
import { boxSilhouette, worldToScreen, type OfficeView } from "@/world/office/officeCamera";
import { officeRuntime, useOfficeStore } from "@/world/office/officeStore";
import { botsInRoom } from "@/world/office/officeRoster";

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
  const nodes = useRef(new Map<HTMLElement, Anchor>());
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
        const outline = boxSilhouette(OFFICE_ROOMS_BY_ID[focused]!.bounds, view, viewport)
          .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
          .join(" ");
        shade.current.style.clipPath = `path(evenodd, "M0 0H${viewport.width}V${viewport.height}H0Z ${outline}Z")`;
      }
      for (const [node, anchor] of nodes.current) {
        const point = worldToScreen(anchor, view, viewport);
        // A etiqueta da sala desce para o cruzamento dos corredores, sem cobrir a sala;
        // a do bot fica acima da cabeça.
        const below = node.dataset.room !== undefined || node.classList.contains("office-entrance-tag");
        node.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, ${below ? "4px" : "-100%"})`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (layer.current) layer.current.dataset.dirty = "true";
  });

  return (
    <div className="office-labels" ref={layer}>
      <div className={focusedRoomId ? "office-shade on" : "office-shade"} ref={shade} aria-hidden />
      {OFFICE_ROOMS.map((room) => {
        const occupants = botsInRoom(seating, room.id);
        const names = occupants.map((id) => bots.find((bot) => bot.id === id)?.name ?? id);
        const owner = room.kind === "department" ? (names[0] ?? "posto vazio") : occupants.length > 0 ? `${occupants.length} em posto` : "área comum";
        // Em foco, a parede alta pode esconder os vizinhos: etiqueta deles só atrapalharia.
        const classes = ["office-room-tag", room.id === hoveredRoomId ? "hovered" : "", focusedRoomId ? "focused" : ""].filter(Boolean).join(" ");
        return (
          <button
            key={room.id}
            type="button"
            ref={place([room.bounds.maxX - 0.15, 0.1, room.bounds.maxZ + 0.22])}
            className={classes}
            style={{ "--tag-color": room.color } as React.CSSProperties}
            data-room={room.id}
            onClick={() => useOfficeStore.getState().focusRoom(room.id)}
            onPointerEnter={() => useOfficeStore.getState().setHovered(room.id, null)}
          >
            <strong>{room.name}</strong>
            <span>{owner}</span>
          </button>
        );
      })}
      {bots.map((bot) => {
        const seat = OFFICE_SEATS_BY_ID[seating.seats[bot.id] ?? ""];
        if (!seat) return null;
        const active = bot.id === selectedBotId || bot.id === hoveredBotId;
        const elsewhere = focusedRoomId !== null && seat.roomId !== focusedRoomId;
        const classes = ["office-bot-tag", active ? "active" : "", seat.kind === "posto" ? "" : "extra", elsewhere ? "elsewhere" : ""].filter(Boolean).join(" ");
        return (
          <button
            key={bot.id}
            type="button"
            ref={place([seat.x, 1.92, seat.z])}
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
      <span className="office-entrance-tag" ref={place([ENTRANCE.x - 0.1, 0.1, ENTRANCE.z + 1.5])}>
        Entrada
      </span>
    </div>
  );
}
