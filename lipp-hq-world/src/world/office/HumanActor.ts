import { Group } from "three";
import type { HumanMotion } from "@/avatar/human/HumanFigure";
import { SIT_TIMELINE } from "@/avatar/human/seatFit";
import { FACING, type OfficeSeat } from "./officeLayout";
import {
  HUMAN_SCALE,
  CHAIR_READY_FROM,
  chairAtHome,
  chairReadiness,
  chairReady,
  chairRoute,
  pathLength,
  pathPose,
  seatMoment,
  turnToward,
  type ChairPose,
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
}

const TURN_PER_SECOND = 7;
/** Girar no lugar antes de sentar e depois de levantar: passinhos, não um pião. */
const PIVOT_PER_SECOND = 3.2;
const LONGEST_FRAME = 0.05;

const aligned = (from: number, to: number) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from))) < 1e-3;

/**
 * Leva uma pessoa do lugar à cadeira e de volta, e move a cadeira junto. Tudo sai do tempo
 * decorrido: sem timer, sem sorteio, então o mesmo comando dá sempre o mesmo movimento. Não há
 * rotina própria: só anda e senta quando alguém manda, para não parecer que está trabalhando.
 */
export class HumanActor {
  readonly holder = new Group();
  phase: HumanPhase = "standing";
  private goal: HumanGoal = "standing";
  private readonly seat: OfficeSeat | null;
  private readonly spot: Point;
  private readonly route: readonly Point[];
  /**
   * Metros já andados. Abaixo de zero, ela ainda não saiu do lugar: caminho curto não dá tempo
   * de a cadeira se virar, então ela espera a cadeira começar.
   */
  private walked = 0;
  private errandPath: readonly Point[] = [];
  private errandWalked = 0;
  private backwards = false;
  private seatTime = 0;
  private hipsBack = 0;
  private x: number;
  private z: number;
  private yaw: number = FACING.south;
  /** Onde está a cadeira desta pessoa: quem desenha a cadeira lê daqui. */
  chair: ChairPose | null;

  constructor(
    private readonly figure: ActorFigure,
    human: Pick<OfficeHuman, "spot" | "chair" | "route">,
    private readonly clips: ActorClips,
    private readonly reduced: boolean,
  ) {
    this.spot = human.spot;
    this.seat = human.chair;
    this.chair = human.chair ? chairAtHome(human.chair) : null;
    this.x = human.spot.x;
    this.z = human.spot.z;
    this.route = human.route ?? (human.chair ? chairRoute(human.spot, human.chair) : [human.spot]);
    this.holder.scale.setScalar(HUMAN_SCALE);
    this.holder.add(figure.root);
    this.place();
  }

  private place() {
    this.holder.position.set(this.x, 0, this.z);
    this.holder.rotation.y = this.yaw;
  }

  /** Onde a pessoa está no chão: sentada, é o ponto sob a bacia, não o dos pés. */
  get position() {
    return { x: this.x - Math.sin(this.yaw) * this.hipsBack, y: 0, z: this.z - Math.cos(this.yaw) * this.hipsBack };
  }

  get heading() {
    return this.yaw;
  }

  get seatId() {
    return this.seat?.id ?? null;
  }

  /** Pessoa que volta à cena já está onde devia: sem refazer o caminho até a cadeira. */
  settle(goal: HumanGoal) {
    if (goal === "seated" && !this.seat) return;
    this.goal = goal;
    if (goal === "seated") this.jump();
  }

  /** Coloca a pessoa num ponto, sem andar. Quem chega de fora da cena começa assim. */
  moveTo(point: Point) {
    this.x = point.x;
    this.z = point.z;
    this.place();
  }

  /** Anda por um caminho qualquer e fica em pé no fim. Só sai de quem está parado em pé. */
  errand(path: readonly Point[]) {
    if (this.phase !== "standing") return;
    if (this.reduced) {
      this.moveTo(path[path.length - 1]!);
      return;
    }
    this.errandPath = path;
    this.errandWalked = 0;
    this.phase = "errand";
    this.figure.play("walk");
  }

  private walkErrand(step: number) {
    this.errandWalked += this.clips.walkSpeed * HUMAN_SCALE * step;
    const pose = pathPose(this.errandPath, this.errandWalked);
    this.x = pose.x;
    this.z = pose.z;
    this.yaw = turnToward(this.yaw, pose.yaw, TURN_PER_SECOND * step);
    if (this.errandWalked >= pathLength(this.errandPath)) {
      this.phase = "standing";
      this.figure.play("idle");
      this.advance();
    }
  }

  /** Muda o destino. Quem está no meio de um movimento termina antes de atender. */
  command(goal: HumanGoal) {
    if (goal === "seated" && !this.seat) return;
    if (goal === this.goal) return;
    this.goal = goal;
    if (this.reduced) this.jump();
    else this.advance();
  }

  private moment(time: number) {
    const moment = seatMoment(this.seat!, time);
    this.x = moment.root.x;
    this.z = moment.root.z;
    this.yaw = moment.yaw;
    this.hipsBack = moment.hipsBack;
    this.chair = moment.chair;
  }

  /** Movimento reduzido: vai direto ao fim, sem andar. */
  private jump() {
    if (this.goal === "seated") {
      this.moment(SIT_TIMELINE.duration);
      this.figure.play("sit", { instant: true });
      this.phase = "seated";
    } else {
      this.x = this.spot.x;
      this.z = this.spot.z;
      this.yaw = FACING.south;
      this.hipsBack = 0;
      this.chair = chairAtHome(this.seat!);
      this.figure.play("idle", { instant: true, frozen: true });
      this.phase = "standing";
    }
    this.place();
  }

  private advance() {
    if (this.phase === "standing" && this.goal === "seated") {
      this.phase = "toChair";
      this.backwards = false;
      this.walked = Math.min(0, pathLength(this.route) - CHAIR_READY_FROM);
      if (this.walked === 0) this.figure.play("walk");
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
        this.sit(step);
        break;
      case "errand":
        this.walkErrand(step);
        break;
      default:
        break;
    }
    if (this.phase === "standing") this.yaw = turnToward(this.yaw, FACING.south, TURN_PER_SECOND * step);
    this.place();
  }

  get moving() {
    return this.phase === "toChair" || this.phase === "toSpot" || this.phase === "errand";
  }

  private walk(step: number) {
    const total = pathLength(this.route);
    if (this.backwards && this.walked === 0) {
      // Acabou de descer: ainda está de costas para a cadeira. Vira antes de sair andando.
      const leaving = pathPose(this.route, total).yaw + Math.PI;
      this.yaw = turnToward(this.yaw, leaving, PIVOT_PER_SECOND * step);
      if (!aligned(this.yaw, leaving)) return;
    }
    if (!this.backwards && this.walked >= total) {
      const backToChair = this.seat!.yaw + Math.PI;
      this.yaw = turnToward(this.yaw, backToChair, PIVOT_PER_SECOND * step);
      if (!aligned(this.yaw, backToChair)) return;
      this.phase = "sitting";
      this.seatTime = 0;
      this.figure.play("sit");
      return;
    }
    const before = this.walked;
    const end = this.backwards ? Math.max(total, CHAIR_READY_FROM) : total;
    this.walked = Math.min(end, before + this.clips.walkSpeed * HUMAN_SCALE * step);
    if (!this.backwards && before < 0 && this.walked >= 0) this.figure.play("walk");
    if (this.backwards && before < total && this.walked >= total) this.figure.play("idle");
    const stepping = this.backwards ? before < total : this.walked >= 0;
    if (stepping) {
      const pose = pathPose(this.route, this.backwards ? total - this.walked : this.walked);
      this.x = pose.x;
      this.z = pose.z;
      this.yaw = turnToward(this.yaw, this.backwards ? pose.yaw + Math.PI : pose.yaw, TURN_PER_SECOND * step);
    }
    if (this.seat) this.chair = chairReady(this.seat, chairReadiness(this.backwards ? this.walked : total - this.walked));
    if (this.backwards && this.walked >= end) {
      this.phase = "standing";
      this.advance();
    }
  }

  /** Sobe na cadeira, gira com ela e rola até a mesa. Levantar é o mesmo tempo ao contrário. */
  private sit(step: number) {
    this.seatTime = Math.min(this.seatTime + step, SIT_TIMELINE.duration);
    this.moment(this.phase === "sitting" ? this.seatTime : SIT_TIMELINE.duration - this.seatTime);
    if (this.seatTime < SIT_TIMELINE.duration) return;
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
