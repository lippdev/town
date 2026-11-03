import { ROOMS } from "@/world/rooms/rooms";
import { RoomSign } from "@/world/rooms/RoomSign";

/** Letreiro de cada sala, no piso junto à porta principal. */
export function RoomSigns() {
  return (
    <group name="room-signs">
      {ROOMS.map((room) => (
        <RoomSign key={room.id} room={room} />
      ))}
    </group>
  );
}
