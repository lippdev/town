import { AGENTS_BY_ID } from "@/agents/agents";
import { ROOMS } from "@/world/rooms/rooms";
import { PALETTE } from "@/config/constants";
import type { RoomDefinition } from "@/types/hq";
import { Bookshelf, Chair, Desk, MeetingTable, Monitor, Plant, ScreenBoard, Whiteboard } from "@/world/furniture/Furniture";
import { CoffeeStation, Couch, Crates, DeskClutter, Rug, WallArt } from "@/world/furniture/Decor";

interface RoomFurnitureProps {
  room: RoomDefinition;
}

/**
 * Monta o interior de uma sala a partir da planta. A mesa fica encostada na
 * parede norte (com a tela voltada para dentro), a cadeira de frente para ela,
 * e o detalhe de especialidade no canto.
 */
function DepartmentRoom({ room }: RoomFurnitureProps) {
  const { bounds } = room;
  const agent = room.agentId ? AGENTS_BY_ID[room.agentId] : undefined;
  const cx = (bounds.minX + bounds.maxX) / 2;

  const deskPosition: [number, number, number] = [cx, 0, bounds.minZ + 1.15];

  return (
    <group name={`furniture-${room.id}`}>
      <Desk position={deskPosition} />
      <Chair position={[cx, 0, bounds.minZ + 2.35]} rotation={Math.PI} />
      {agent ? (
        <>
          <Monitor position={[cx - 0.5, 0.78, bounds.minZ + 1.02]} accent={agent.accent} />
          <Monitor position={[cx + 0.55, 0.78, bounds.minZ + 1.05]} accent={PALETTE.screenGlow} />
        </>
      ) : (
        <Monitor position={[cx, 0.78, bounds.minZ + 1.02]} />
      )}
      <Plant position={[bounds.minX + 1.0, 0, bounds.minZ + 1.0]} />
      <Plant position={[bounds.maxX - 1.0, 0, bounds.maxZ - 1.2]} />
      <Rug room={room} />
      <WallArt room={room} />
      <DeskClutter room={room} />
    </group>
  );
}

/** Detalhe de especialidade por departamento. */
function Specialty({ room }: RoomFurnitureProps) {
  const { bounds } = room;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  switch (room.agentId) {
    case "pulse":
      return (
        <ScreenBoard
          position={[bounds.minX + 1.1, 0, cz]}
          rotation={Math.PI / 2}
          accent="#22d3ee"
        />
      );
    case "forge":
      return (
        <Whiteboard
          position={[cx + 1.6, 0, bounds.maxZ - 0.9]}
          accent="#fde8d2"
        />
      );
    case "echo":
      return (
        <group>
          <ScreenBoard position={[bounds.maxX - 1.1, 0, cz]} rotation={-Math.PI / 2} accent="#d8b4fe" />
          <Couch position={[bounds.minX + 1.35, 0, cz + 0.6]} rotation={Math.PI / 2} />
        </group>
      );
    case "scout":
      return <Bookshelf position={[bounds.minX + 0.9, 0, cz]} rotation={Math.PI / 2} />;
    case "atlas":
      return (
        <Whiteboard
          position={[bounds.maxX - 1.35, 0, cz]}
          rotation={-Math.PI / 2}
          accent="#f3e6c8"
        />
      );
    case "ink":
      return (
        <ScreenBoard
          position={[bounds.minX + 1.1, 0, cz]}
          rotation={Math.PI / 2}
          accent="#f9a8d4"
        />
      );
    case "argos":
      return (
        <group>
          <ScreenBoard position={[cx, 0, bounds.maxZ - 0.85]} rotation={0} accent="#93c5fd" />
          <Crates room={room} />
        </group>
      );
    default:
      return null;
  }
}

/** Hall: identidade da Lipp HQ e poucos elementos. */
function Hall() {
  return (
    <group name="furniture-hall">
      <CoffeeStation position={[3.1, 0, 0]} />
      <Plant position={[-2.6, 0, -1.4]} />
      <Plant position={[2.6, 0, 1.4]} />
      <Plant position={[-2.6, 0, 1.8]} />
      <Plant position={[2.6, 0, -1.8]} />
    </group>
  );
}

/** Sala de reuniões: mesa grande e cadeiras em volta. */
function MeetingRoom({ room }: RoomFurnitureProps) {
  const { bounds } = room;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <group name="furniture-reunioes">
      <Rug room={room} />
      <MeetingTable position={[cx, 0, cz]} />
      {([-1.15, 0, 1.15]).map((offset) => (
        <Chair key={`n-${offset}`} position={[cx + offset, 0, cz - 1.25]} rotation={0} />
      ))}
      {([-1.15, 0, 1.15]).map((offset) => (
        <Chair key={`s-${offset}`} position={[cx + offset, 0, cz + 1.25]} rotation={Math.PI} />
      ))}
      <ScreenBoard position={[cx, 0, bounds.maxZ - 0.85]} accent="#c7d2fe" />
      <Plant position={[bounds.minX + 0.9, 0, bounds.minZ + 1.0]} />
    </group>
  );
}

/** Mobiliário de todas as salas, montado da planta. */
export function Furniture() {
  return (
    <group name="furniture">
      {ROOMS.map((room) =>
        room.id === "hall" ? (
          <Hall key={room.id} />
        ) : room.id === "reunioes" ? (
          <MeetingRoom key={room.id} room={room} />
        ) : (
          <group key={room.id}>
            <DepartmentRoom room={room} />
            <Specialty room={room} />
          </group>
        ),
      )}
    </group>
  );
}
