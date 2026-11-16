/**
 * Cenário de empresa da demonstração (`&cenario=`): troca os dados do prédio, nunca o código dele.
 *
 * O cenário chega num arquivo à parte, baixado antes do escritório (`loadScenario` em `App.tsx`), e
 * os módulos do prédio leem `activeScenario()` ao serem importados. Por isso este arquivo não importa
 * nada que leia o cenário, e o arquivo do cenário só importa tipos daqui: se um módulo do prédio
 * fosse avaliado antes, `installScenario` falha alto em vez de mostrar um prédio pela metade.
 */

import type { ConversationItem } from "@/components/office/conversationModel";
import type { KanbanColumnId } from "@/components/office/kanbanModel";

export type ScenarioId = "alyxmed";

export interface ScenarioPoint {
  x: number;
  z: number;
}

/** Imagem oficial numa placa ou tela da cena. A imagem cabe inteira, centrada sobre o fundo. */
export interface ScenarioPanel {
  url: string;
  at: readonly [number, number, number];
  width: number;
  height: number;
  rotationY?: number;
  /** Cor de fundo da placa; sem ela, a imagem ocupa a placa toda. */
  background?: string;
  /** Folga em volta da imagem, em fração do lado menor. */
  pad?: number;
  /** Largura sobre altura da imagem, para SVG só com viewBox. */
  ratio?: number;
}

/** Lugar de um bot num andar de equipe: a mobília põe o equipamento no lugar da cadeira. */
export interface ScenarioPost {
  key: string;
  zone: string;
  x: number;
  z: number;
  /** 0 é o sul e π/2 o leste: os dois lados virados para a câmera. */
  yaw: number;
}

export interface ScenarioFloor {
  /** Andar de expansão de onde vem a planta. Sem ele, é o próprio andar. */
  base?: string;
  level: number;
  openShaft: number;
  title: string;
  /** Nome e propósito das zonas da planta, pela chave delas. */
  zones: Readonly<Record<string, { name: string; purpose: string }>>;
  posts: readonly ScenarioPost[];
  panels: readonly ScenarioPanel[];
}

export interface ScenarioBot {
  id: string;
  name: string;
  role: string;
  responsibility: string;
  color: string;
  team: string | null;
  /** Posto da Operação (`engenharia-0`) ou de andar de equipe (`expansao-3-mesa-a`). */
  seat: string;
}

/** Lugar de pé na sala de reunião, com o rosto para onde olha. */
export interface ScenarioSpot extends ScenarioPoint {
  yaw: number;
}

/** Reunião fixa da equipe, todo dia, em horas do relógio da demonstração ("09:30"). */
export interface ScenarioMeeting {
  title: string;
  start: string;
  end: string;
}

export interface ScenarioTeam {
  id: string;
  name: string;
  /** Andar da equipe. */
  floor: string;
  /** Sala onde a equipe se reúne, e um lugar de pé ali para cada bot, na ordem da equipe. */
  meetingRoom: string;
  spots: readonly ScenarioSpot[];
  meetings: readonly ScenarioMeeting[];
}

/** Cartão de exemplo do quadro: sempre de um bot, sempre fictício. */
export interface ScenarioTask {
  id: string;
  owner: string;
  title: string;
  column: KanbanColumnId;
}

/** A atividade simulada: a mesma semente dá o mesmo dia. */
export interface ScenarioActivity {
  seed: number;
  tasks: readonly ScenarioTask[];
  /** Conversa de exemplo de cada bot, pelo id. As mensagens não levam horário. */
  talks: Readonly<Record<string, readonly ConversationItem[]>>;
}

export interface OfficeScenario {
  id: ScenarioId;
  brand: {
    name: string;
    slogan: string;
    site: string;
    /** Logo com texto claro, para fundo escuro. */
    logoOnDark: string;
    /** Logo com texto escuro, para fundo claro. */
    logoOnLight: string;
    /** Só o símbolo, quadrado. */
    icon: string;
    colors: { primary: string; deep: string; ink: string; paper: string };
  };
  owner: { name: string; role: string };
  leadership: readonly string[];
  teams: readonly ScenarioTeam[];
  bots: readonly ScenarioBot[];
  /** Andares de expansão que viram andar de equipe, pelo id. */
  floors: Readonly<Record<string, ScenarioFloor>>;
  /** O andar da Operação: nome no seletor, nomes das salas e o que se vê nas paredes. */
  operacao: { title: string; rooms: Readonly<Record<string, { name: string; purpose: string }>>; panels: readonly ScenarioPanel[] };
  /** No lugar da placa da recepção e do letreiro do topo da torre. */
  lobby: { panels: readonly ScenarioPanel[] };
  /** O letreiro do topo da torre: a placa é a de sempre, muda a imagem. */
  facade: Pick<ScenarioPanel, "url" | "background" | "pad" | "ratio">;
  activity: ScenarioActivity;
}

let active: OfficeScenario | null = null;
let read = false;

/** O cenário em uso. Ler marca que o prédio já foi montado com ele. */
export function activeScenario(): OfficeScenario | null {
  read = true;
  return active;
}

export function installScenario(scenario: OfficeScenario) {
  if (read && active !== scenario) throw new Error(`O cenário ${scenario.id} chegou depois do prédio: ele precisa ser instalado antes de o escritório ser importado.`);
  active = scenario;
}

