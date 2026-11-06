import { create } from "zustand";
import { CHIEF_ROOM } from "./officeDirectorate";
import { BATTLE_CONSOLE, GIANT_COIN, HIDEOUT_DOOR, SIGNAL_LAMP, TURNTABLE } from "./officeHideout";
import type { BuildingView } from "./officeBuilding";
import type { PickBox } from "./officeCamera";

/**
 * As passagens e os segredos: o que cada um faz, onde se aponta e o que ele diz. O estado vive só na
 * memória da página: recarregar esquece tudo de propósito, e nada vai para o armazenamento do usuário.
 */
export type SecretSpotId = "livro" | "relogio" | "porta" | "terminal" | "holofote" | "carro" | "moeda";

export interface SecretSpot {
  id: SecretSpotId;
  view: BuildingView;
  /** Onde se aponta: um pouco maior que a peça, para dar para acertar de longe. */
  box: Omit<PickBox, "id">;
  /** Onde o botão de teclado e a legenda ficam. */
  anchor: readonly [number, number, number];
  /** Nome para o leitor de tela: não entrega o que há atrás. */
  label: string;
}

/** Trecho móvel da estante da sala do chefe: uma das três seções. */
export const SECRET_SHELF = { x: CHIEF_ROOM.minX + 0.42, z: -6.6, width: 1.2, height: 2.5, hingeZ: -7.2, bookY: 1.46, bookZ: -6.42 } as const;
export const SECRET_CLOCK = { x: -3.45, y: 2.05, z: CHIEF_ROOM.minZ + 0.11, radius: 0.34 } as const;

const around = (x: number, y: number, z: number, half: number, height = half): Omit<PickBox, "id"> => ({ minX: x - half, maxX: x + half, minY: y - height, maxY: y + height, minZ: z - half, maxZ: z + half });

export const SECRET_SPOTS: readonly SecretSpot[] = [
  { id: "livro", view: "diretoria", box: { minX: SECRET_SHELF.x - 0.3, maxX: SECRET_SHELF.x + 0.3, minY: 1.12, maxY: 1.72, minZ: SECRET_SHELF.bookZ - 0.3, maxZ: SECRET_SHELF.bookZ + 0.3 }, anchor: [SECRET_SHELF.x + 0.3, SECRET_SHELF.bookY, SECRET_SHELF.bookZ], label: "Um livro fora do lugar" },
  { id: "relogio", view: "diretoria", box: { minX: SECRET_CLOCK.x - 0.42, maxX: SECRET_CLOCK.x + 0.42, minY: SECRET_CLOCK.y - 0.42, maxY: SECRET_CLOCK.y + 0.42, minZ: SECRET_CLOCK.z - 0.05, maxZ: SECRET_CLOCK.z + 0.1 }, anchor: [SECRET_CLOCK.x, SECRET_CLOCK.y - 0.5, SECRET_CLOCK.z + 0.1], label: "Relógio de parede" },
  { id: "porta", view: "esconderijo", box: { minX: HIDEOUT_DOOR.x - 1.4, maxX: HIDEOUT_DOOR.x + 1.4, minY: 0, maxY: 3, minZ: HIDEOUT_DOOR.z - 0.3, maxZ: HIDEOUT_DOOR.z + 0.5 }, anchor: [HIDEOUT_DOOR.x, 1.3, HIDEOUT_DOOR.z + 0.5], label: "Porta de volta à Diretoria" },
  { id: "terminal", view: "esconderijo", box: { minX: BATTLE_CONSOLE.x - BATTLE_CONSOLE.width / 2, maxX: BATTLE_CONSOLE.x + BATTLE_CONSOLE.width / 2, minY: 0, maxY: 3, minZ: BATTLE_CONSOLE.z - 0.9, maxZ: BATTLE_CONSOLE.z + 0.5 }, anchor: [BATTLE_CONSOLE.x + 1.6, 1.15, BATTLE_CONSOLE.z + 0.5], label: "Terminal de investigação" },
  { id: "holofote", view: "esconderijo", box: around(SIGNAL_LAMP.x, 0.85, SIGNAL_LAMP.z, 0.6, 0.9), anchor: [SIGNAL_LAMP.x, 1.75, SIGNAL_LAMP.z], label: "Holofote" },
  { id: "carro", view: "esconderijo", box: { minX: TURNTABLE.x - 2.2, maxX: TURNTABLE.x + 2.2, minY: 0, maxY: 1.5, minZ: TURNTABLE.z - 2.2, maxZ: TURNTABLE.z + 2.2 }, anchor: [TURNTABLE.x, 1.75, TURNTABLE.z], label: "Carro na plataforma" },
  { id: "moeda", view: "esconderijo", box: around(GIANT_COIN.x, GIANT_COIN.radius + 0.2, GIANT_COIN.z, 1, GIANT_COIN.radius + 0.2), anchor: [GIANT_COIN.x, GIANT_COIN.radius * 2 + 0.55, GIANT_COIN.z], label: "Moeda gigante" },
];

export const secretSpotsOf = (view: BuildingView) => SECRET_SPOTS.filter((spot) => spot.view === view);

/** Telas de arquivo do terminal: `terminal` passa de uma para a outra. */
export const TERMINAL_FILES = 3;

interface SecretState {
  /** A estante está aberta. Fecha sozinha quando se vai para qualquer outro lugar do prédio. */
  doorOpen: boolean;
  /** Já passou pela estante nesta página: o seletor passa a oferecer o esconderijo. */
  found: boolean;
  /** O relógio andou: o livro acende. */
  clockHint: boolean;
  file: number;
  signal: boolean;
  engine: boolean;
  /** Cada ligada conta uma volta: a cena dá a volta quando este número muda. */
  engineTurns: number;
  coin: "cara" | "coroa" | null;
  /** Vezes que a moeda foi lançada: a cena gira a cada mudança. */
  coinFlips: number;
  /** O que está apontado na cena ou acabou de responder: a legenda aparece nele. */
  activeSpot: SecretSpotId | null;
  /** O que o último gesto respondeu, para quem usa leitor de tela. */
  announcement: string;
  setActiveSpot: (spot: SecretSpotId | null) => void;
  /** Não é "subscribe" na loja do prédio: é o próprio prédio que avisa ao mudar de vista. */
  viewChanged: (view: BuildingView) => void;
  /** O efeito do gesto. Entrar e sair mudam de vista: é quem chama que leva até lá. */
  activate: (spot: SecretSpotId) => "entrar" | "sair" | null;
}

export const useSecretStore = create<SecretState>((set, get) => ({
  doorOpen: false,
  found: false,
  clockHint: false,
  file: 0,
  signal: false,
  engine: false,
  engineTurns: 0,
  coin: null,
  coinFlips: 0,
  activeSpot: null,
  announcement: "",
  setActiveSpot: (activeSpot) => {
    if (get().activeSpot !== activeSpot) set({ activeSpot });
  },
  viewChanged: (view) => {
    if (view === "esconderijo") set({ found: true, doorOpen: true, activeSpot: null });
    else if (view === "diretoria") set({ activeSpot: null });
    else set({ doorOpen: false, activeSpot: null });
  },
  activate: (spot) => {
    const state = get();
    const say = (announcement: string, next: Partial<SecretState> = {}) => set({ activeSpot: spot, announcement, ...next });
    switch (spot) {
      case "livro":
        if (state.doorOpen) {
          say("Descendo a passagem.");
          return "entrar";
        }
        say("A estante se abriu: há uma passagem atrás dela.", { doorOpen: true });
        return null;
      case "porta":
        say("Voltando à Diretoria.");
        return "sair";
      case "relogio":
        say(state.clockHint ? "O relógio voltou para a hora de antes." : "Os ponteiros foram à meia-noite, e algo brilhou na estante.", { clockHint: !state.clockHint });
        return null;
      case "terminal": {
        const file = (state.file + 1) % TERMINAL_FILES;
        say(`Arquivo ${file + 1} de ${TERMINAL_FILES} no terminal.`, { file });
        return null;
      }
      case "holofote":
        say(state.signal ? "Holofote desligado." : "Holofote ligado: o sinal aparece na parede e no céu da cidade.", { signal: !state.signal });
        return null;
      case "carro":
        say(state.engine ? "Motor desligado." : "Motor ligado: a plataforma dá uma volta.", state.engine ? { engine: false } : { engine: true, engineTurns: state.engineTurns + 1 });
        return null;
      case "moeda": {
        const coin = state.coin === "cara" ? "coroa" : "cara";
        say(coin === "cara" ? "Deu cara." : "Deu coroa.", { coin, coinFlips: state.coinFlips + 1 });
        return null;
      }
    }
  },
}));

/** A legenda de cada segredo, conforme o estado dele. */
export function secretCaption(spot: SecretSpotId, state: Pick<SecretState, "doorOpen" | "clockHint" | "file" | "signal" | "engine" | "coin">): string {
  switch (spot) {
    case "livro":
      return state.doorOpen ? "Descer pela passagem" : "Um livro fora do lugar";
    case "relogio":
      return state.clockHint ? "Meia-noite" : "Parado em 10:47";
    case "porta":
      return "Voltar à Diretoria";
    case "terminal":
      return `Arquivo ${state.file + 1} de ${TERMINAL_FILES} · trocar`;
    case "holofote":
      return state.signal ? "Holofote ligado" : "Ligar o holofote";
    case "carro":
      return state.engine ? "Desligar o motor" : "Ligar o motor";
    case "moeda":
      return state.coin === null ? "Lançar a moeda" : state.coin === "cara" ? "Cara · lançar de novo" : "Coroa · lançar de novo";
  }
}
