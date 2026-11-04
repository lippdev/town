/**
 * As medidas que a pose sentada precisa conhecer, em metros do andar. Quem desenha a cadeira
 * lê daqui: pose e móvel não têm como discordar. Não importa three.
 *
 * Referencial da cadeira: origem no eixo dela, no chão, com +Z na direção em que o assento olha.
 */

/** O arquivo tem cerca de 2,05 m, e metade é cabeça; esta escala deixa a pessoa com 1,48 m. */
export const HUMAN_SCALE = 0.72;

export const CHAIR = {
  seatTop: 0.33,
  seatBottom: 0.21,
  seatWidth: 0.54,
  /**
   * O assento vai só até aqui. A coxa da figura tem 16 cm: num assento de 55 cm, o joelho
   * ficaria longe da borda e a canela não teria para onde dobrar.
   */
  seatFront: 0.02,
  seatRear: -0.31,
  backFront: -0.2625,
  backRear: -0.3575,
  backBottom: 0.41,
  backTop: 1.03,
  /** Apoio dos pés, na frente do eixo. As pernas têm 36 cm e o assento fica a 33 cm do chão. */
  footBar: { y: 0.238, z: 0.2, radius: 0.012, halfWidth: 0.27 },
  /** A base é um X, para a pessoa em pé ficar perto sem pisar nela. */
  baseReach: 0.31,
} as const;

export const DESK = { top: 0.72, underside: 0.63 } as const;

export const SIT = {
  /** Distância do eixo até os pés de quem está em pé, de costas para o assento. */
  standOff: 0.45,
  /** Quanto a cadeira recua da posição dela para o encosto poder girar sem bater na mesa. */
  swivelClear: 0.09,
  /** Quanto a cadeira avança além da posição dela: barriga quase na borda, braços alcançam. */
  tuck: 0.03,
  /** Do eixo à borda da mesa, com a cadeira puxada. */
  deskEdge: 0.3,
  /** Junta do quadril acima do chão: o assento mais a espessura da coxa, medida na malha. */
  hipJointY: 0.463,
  /** Osso da bacia, em relação ao eixo. A traseira da calça encosta no encosto. */
  hipsZ: 0,
} as const;

/** Instantes do clipe de sentar, em segundos. Levantar é o mesmo clipe de trás para a frente. */
export const SIT_TIMELINE = {
  climbEnd: 1.5,
  swivelEnd: 2.8,
  tuckEnd: 3.3,
  duration: 3.9,
} as const;
