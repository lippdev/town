import { Group } from "three";
import type { HumanMotion } from "@/avatar/human/HumanFigure";
import { FACING, type OfficeSeat } from "./officeLayout";
import {
  HUMAN_SCALE,
  HUMAN_SEAT_LIFT,
  chairRoute,
  pathLength,
  pathPose,
  seatedRoot,
  turnToward,
  type HumanGoal,
  type HumanPhase,
  type OfficeHuman,
  type Point,
} from "./officeHumans";

/** O que o ator usa da figura. Sem isto, o teste precisaria de arquivos e de WebGL. */
export interface ActorFigure {
  root: Group;
  play: (motion: HumanMotion, options?: { instant?: boolean; frozen?: boolean; timeScale?: number }) => void;
  update: (delta: number, options?: { blink?: boolean }) => void;
  readonly settled: boolean;
}

export interface ActorClips {
  /** Metros por segundo em que o pé de apoio não escorrega. */
  walkSpeed: number;
  sitDuration: number;
  seatedHipsZ: number;
}

const TURN_PER_SECOND = 7;
const LONGEST_FRAME = 0.05;

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/**
 * Leva uma pessoa do lugar à cadeira e de volta. Tudo sai do tempo decorrido: sem timer,
 * sem sorteio, então o mesmo comando dá sempre o mesmo movimento. Não há rotina própria:
 * só anda e senta quando alguém manda, para não parecer que está trabalhando.
 */
export class HumanActor {
  readonly holder = new Group();
  phase: HumanPhase = "standing";
  private goal: HumanGoal = "standing";
  private readonly chair: OfficeSeat | null;
  private readonly spot: Point;
  private readonly route: Point[];
  private readonly target: Point | null;
  private walked = 0;
  private backwards = false;
  private seatTime = 0;
  private x: number;
  private z: number;
  private y = 0;
  private yaw: number = FACING.south;

  constructor(
    private readonly figure: ActorFigure,
    human: Pick<OfficeHuman, "spot" | "chair">,
    private readonly clips: ActorClips,
    private readonly reduced: boolean,
  ) {
    this.spot = human.spot;
    this.chair = human.chair;
    this.x = human.spot.x;
    this.z = human.spot.z;
    this.route = human.chair ? chairRoute(human.spot, human.chair) : [human.spot];
    this.target = human.chair ? seatedRoot(human.chair, clips.seatedHipsZ) : null;
    this.holder.scale.setScalar(HUMAN_SCALE);
    this.holder.add(figure.root);
    this.place();
  }

  private place() {
    this.holder.position.set(this.x, this.y, this.z);
    this.holder.rotation.y = this.yaw;
  }

  get position() {
    return { x: this.x, y: this.y, z: this.z };
  }

  get heading() {
    return this.yaw;
  }

  /** Muda o destino. Quem está no meio de um movimento termina antes de atender. */
  command(goal: HumanGoal) {
    if (goal === "seated" && !this.chair) return;
    if (goal === this.goal) return;
    this.goal = goal;
    if (this.reduced) this.jump();
    else this.advance();
  }

  /** Movimento reduzido: vai direto ao fim, sem andar. */
  private jump() {
    if (this.goal === "seated") {
      this.x = this.target!.x;
      this.z = this.target!.z;
      this.y = HUMAN_SEAT_LIFT;
      this.yaw = this.chair!.yaw;
      this.figure.play("sit", { instant: true });
      this.phase = "seated";
    } else {
      this.x = this.spot.x;
      this.z = this.spot.z;
      this.y = 0;
      this.yaw = FACING.south;
      this.figure.play("idle", { instant: true, frozen: true });
      this.phase = "standing";
    }
    this.place();
  }

  private advance() {
    if (this.phase === "standing" && this.goal === "seated") {
      this.phase = "toChair";
      this.backwards = false;
      this.walked = 0;
      this.figure.play("walk");
    } else if (this.phase === "seated" && this.goal === "standing") {
      this.phase = "rising";
      this.seatTime = 0;
      this.figure.play("stand");
    }
  }

  update(delta: number) {
    const step = Math.min(delta, LONGEST_FRAME);
    this.figure.update(this.reduced ? 0 : step, { blink: !this.reduced });
    if (this.reduced) return;
    switch (this.phase) {
      case "toChair":
      case "toSpot":
        this.walk(step);
        break;
      case "sitting":
      case "rising":
        this.glide(step);
        break;
      default:
        break;
    }
    if (this.phase === "standing") this.yaw = turnToward(this.yaw, FACING.south, TURN_PER_SECOND * step);
    this.place();
  }

  get moving() {
    return this.phase === "toChair" || this.phase === "toSpot";
  }

  private walk(step: number) {
    const total = pathLength(this.route);
    this.walked += this.clips.walkSpeed * HUMAN_SCALE * step;
    const pose = pathPose(this.route, this.backwards ? total - this.walked : this.walked);
    this.x = pose.x;
    this.z = pose.z;
    this.yaw = turnToward(this.yaw, this.backwards ? pose.yaw + Math.PI : pose.yaw, TURN_PER_SECOND * step);
    if (this.walked < total) return;
    if (this.backwards) {
      this.phase = "standing";
      this.figure.play("idle");
      this.advance();
    } else {
      this.phase = "sitting";
      this.seatTime = 0;
      this.figure.play("sit");
    }
  }

  /** Entra de lado na cadeira enquanto o clipe de sentar toca, nos dois sentidos. */
  private glide(step: number) {
    this.seatTime += step;
    const progress = Math.min(this.seatTime / this.clips.sitDuration, 1);
    const seated = this.phase === "sitting" ? progress : 1 - progress;
    const side = this.route[this.route.length - 1]!;
    const eased = smooth(seated);
    this.x = side.x + (this.target!.x - side.x) * eased;
    this.z = side.z + (this.target!.z - side.z) * eased;
    this.y = HUMAN_SEAT_LIFT * eased;
    this.yaw = turnToward(this.yaw, this.chair!.yaw, TURN_PER_SECOND * step);
    if (progress < 1) return;
    if (this.phase === "sitting") {
      this.phase = "seated";
      this.advance();
    } else {
      this.phase = "toSpot";
      this.backwards = true;
      this.walked = 0;
      this.figure.play("walk");
    }
  }
}
