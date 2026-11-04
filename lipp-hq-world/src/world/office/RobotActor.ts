import { Group } from "three";
import type { RobotRig } from "@/avatar/robot/RobotRig";
import type { OfficeSeat } from "./officeLayout";
import { pathPose, turnToward } from "./officeHumans";
import { HOVER_Y, bobAt, botPhase, flightDistanceAt, nextFlightCap, type FlightPlan } from "./officeFlights";

const TURN_PER_SECOND = 3.2;
const LEAN_PER_SPEED = 0.16;
const LEAN_EASE = 6;
const LONGEST_FRAME = 0.05;

export type ActorRig = Pick<RobotRig, "root" | "update">;

/**
 * Leva um robô do posto ao corredor e de volta. A posição é função do instante; só a
 * seleção a interrompe, e mesmo assim sempre ao longo do caminho.
 */
export class RobotActor {
  readonly holder = new Group();
  private cap = Infinity;
  private distance = 0;
  private x: number;
  private z: number;
  private y = HOVER_Y;
  private yaw: number;
  private lean = 0;
  private readonly phase: number;

  constructor(
    readonly rig: RobotRig,
    private readonly seat: OfficeSeat,
    private readonly plan: FlightPlan | null,
    botId: string,
    private readonly reduced: boolean,
  ) {
    this.phase = botPhase(botId);
    this.x = seat.x;
    this.z = seat.z;
    this.yaw = seat.yaw;
    this.holder.rotation.order = "YXZ";
    this.holder.add(rig.root);
    this.place();
  }

  private place() {
    this.holder.position.set(this.x, this.y, this.z);
    this.holder.rotation.y = this.yaw;
    this.holder.rotation.x = this.lean;
  }

  get position() {
    return { x: this.x, y: this.y, z: this.z };
  }

  /** Metros do posto ao longo do caminho; zero é em casa. */
  get flown() {
    return this.distance;
  }

  update(seconds: number, delta: number, selected: boolean) {
    const step = Math.min(delta, LONGEST_FRAME);
    this.rig.update(this.reduced ? 0 : step);
    if (this.reduced) return;

    const before = this.distance;
    if (this.plan) {
      const scheduled = flightDistanceAt(this.plan, seconds);
      this.cap = nextFlightCap(this.cap, scheduled, selected, step);
      this.distance = Math.min(scheduled, this.cap);
      const pose = pathPose(this.plan.path, this.distance);
      this.x = pose.x;
      this.z = pose.z;
      const moved = this.distance - before;
      if (Math.abs(moved) > 1e-4) {
        // Na volta o trecho é o mesmo, percorrido ao contrário: ela olha para onde vai.
        this.yaw = turnToward(this.yaw, moved > 0 ? pose.yaw : pose.yaw + Math.PI, TURN_PER_SECOND * step);
      } else if (this.distance === 0) {
        this.yaw = turnToward(this.yaw, this.seat.yaw, TURN_PER_SECOND * step);
      }
      const speed = step > 0 ? Math.abs(moved) / step : 0;
      this.lean += (Math.min(speed * LEAN_PER_SPEED, 0.32) - this.lean) * Math.min(1, LEAN_EASE * step);
    }
    this.y = HOVER_Y + bobAt(seconds, this.phase);
    this.place();
  }
}
