import { describe, expect, it } from "vitest";
import { assigneeOptions, blockerParts, botForTask, botRequestPreview, lastBotRequest, nudgePreview, nudgeStatus, nudgeText } from "@/activity/actions";
import { epicHealth, storyOf } from "@/activity/selectors";
import { DEFAULT_SEED, SimulatedDay } from "@/activity/simulation";
import { ActivityRuntime, type AppAction } from "@/activity/source";
import { EMAIL } from "@/activity/squad";
import { at } from "@/activity/time";

function runWith(steps: Array<[number, AppAction | null]>, seed = DEFAULT_SEED) {
  const runtime = new ActivityRuntime(new SimulatedDay(seed));
  const notes: string[] = [];
  for (const [when, action] of steps) {
    runtime.advanceTo(when);
    if (action) {
      const result = runtime.perform(action);
      notes.push(result.ok ? result.note : `erro: ${result.problem}`);
    }
  }
  return { runtime, notes };
}

describe("cobrar: o que a tela mostra antes e depois", () => {
  it("o botão diz a quem vai, e a mensagem que sai no canal marcando a pessoa é a mesma", () => {
    const { runtime } = runWith([[at(10, 5), null]]);
    const preview = nudgePreview(runtime.state, "HU-27")!;
    expect(preview).toMatchObject({ reason: "trava", person: { email: EMAIL.marina } });
    // Tom leve, marcando a pessoa: o que se espera dela, desde quando, e o motivo do Notion.
    expect(preview.text).toBe("@Marina, a HU-27 está esperando uma decisão de produto sua desde ontem às 17h, consegue olhar? Motivo: o link vale 15 minutos ou 24 horas?");
    expect(preview.text.match(/esperando/gi)).toHaveLength(1);
    runtime.perform({ kind: "cobrar", storyId: "HU-27" });
    expect(runtime.state.messages.at(-1)).toMatchObject({ text: preview.text, to: "#squad-hubsmart", mentions: [EMAIL.marina] });
  });

  it("o motivo do Notion se parte em o que se espera e o porquê", () => {
    expect(blockerParts("Esperando decisão de produto: o link vale 15 minutos ou 24 horas?")).toEqual({ what: "decisão de produto", why: "o link vale 15 minutos ou 24 horas?" });
    expect(blockerParts("esperando o jurídico")).toEqual({ what: null, why: "o jurídico" });
    expect(blockerParts("API do banco fora do ar")).toEqual({ what: null, why: "API do banco fora do ar" });
  });

  it("HU parada: pergunta se ainda é isso, com desde quando", () => {
    const { runtime } = runWith([[at(10), null]]);
    const story = storyOf(runtime.state, "HU-32")!;
    expect(nudgeText(runtime.state, story, EMAIL.luana)).toBe('@Luana, a HU-32 (Enviar boleto de royalties por e-mail) está em "Em andamento" sem atualização desde dom às 11h20. Ainda é isso, ou tem algo travando?');
  });

  it("sem trava, cobra o responsável (inclusive em QA); concluída não cobra", () => {
    const { runtime } = runWith([[at(10), null]]);
    expect(nudgePreview(runtime.state, "HU-30")).toMatchObject({ reason: "responsavel", person: { email: EMAIL.luana } });
    expect(nudgePreview(runtime.state, "HU-32")).toMatchObject({ reason: "responsavel", person: { email: EMAIL.luana } });
    expect(nudgePreview(runtime.state, "HU-28")).toBeNull();
  });

  it("cobrado fica aguardando até a resposta; antes do refinamento o épico destrava", () => {
    const { runtime } = runWith([[at(10, 5), { kind: "cobrar", storyId: "HU-27" }]]);
    expect(nudgeStatus(runtime.state, "HU-27")).toMatchObject({ to: EMAIL.marina, at: at(10, 5), answeredAt: null });
    runtime.advanceTo(at(10, 40));
    const status = nudgeStatus(runtime.state, "HU-27")!;
    expect(status.answeredAt).not.toBeNull();
    expect(status.answeredAt!).toBeLessThan(at(14));
    expect(storyOf(runtime.state, "HU-27")!.blocked).toBeNull();
    expect(epicHealth(runtime.state, "E-1").level).not.toBe("travado");
  });

  it("sem cobrança não há status, e a mensagem de reatribuição não conta como cobrança", () => {
    const { runtime } = runWith([[at(10, 30), { kind: "reatribuir", storyId: "HU-37", to: EMAIL.luana }]]);
    expect(nudgeStatus(runtime.state, "HU-27")).toBeNull();
    expect(nudgeStatus(runtime.state, "HU-37")).toBeNull();
  });

  it("cobrar a HU parada: a resposta é a pessoa mexer nela", () => {
    const { runtime } = runWith([
      [at(13, 20), { kind: "cobrar", storyId: "HU-32" }],
      [at(14, 0), null],
    ]);
    const status = nudgeStatus(runtime.state, "HU-32")!;
    expect(status.to).toBe(EMAIL.luana);
    expect(status.answeredAt).not.toBeNull();
  });
});

describe("reatribuir: quem pode receber", () => {
  it("todo o squad, com carga, quem está fora e o responsável atual", () => {
    const { runtime } = runWith([[at(10, 30), null]]);
    const options = assigneeOptions(runtime.state, "HU-37");
    expect(options).toHaveLength(7);
    const bianca = options.find((option) => option.person.email === EMAIL.bianca)!;
    expect(bianca.current).toBe(true);
    expect(bianca.away).toBe("Férias até 16/11");
    const luana = options.find((option) => option.person.email === EMAIL.luana)!;
    expect(luana.current).toBe(false);
    expect(luana.away).toBeNull();
    expect(luana.load.stories.map((story) => story.id)).toEqual(expect.arrayContaining(["HU-30", "HU-33"]));
  });
});

describe("pedir ao bot: quem faz e quando começa", () => {
  it("Notion com o Atlas, GitHub com o Pulse", () => {
    expect(botForTask("completar_criterios")).toBe("atlas");
    expect(botForTask("resumir_pr")).toBe("pulse");
    expect(botForTask("cobrar_revisao")).toBe("pulse");
  });

  it("diz se o bot está ocupado e reconhece o pedido já feito", () => {
    const { runtime } = runWith([[at(15, 20), { kind: "pedir_bot", task: "resumir_pr", target: { kind: "pr", number: 144 } }]]);
    const again = botRequestPreview(runtime.state, "resumir_pr", { kind: "pr", number: 144 })!;
    expect(again.bot).toBe("Pulse");
    expect(again.busyWith?.kind).toBe("resumir_pr");
    expect(again.pending).not.toBeNull();
    const other = botRequestPreview(runtime.state, "cobrar_revisao", { kind: "pr", number: 144 })!;
    expect(other.pending).toBeNull();
    expect(other.busyWith).not.toBeNull();
    expect(lastBotRequest(runtime.state, "resumir_pr", { kind: "pr", number: 144 })?.doneAt).toBeNull();
    runtime.advanceTo(at(15, 40));
    expect(lastBotRequest(runtime.state, "resumir_pr", { kind: "pr", number: 144 })?.doneAt).not.toBeNull();
  });

  it("alvo que não existe não tem prévia", () => {
    const { runtime } = runWith([[at(10), null]]);
    expect(botRequestPreview(runtime.state, "resumir_pr", { kind: "pr", number: 999 })).toBeNull();
    expect(botRequestPreview(runtime.state, "completar_criterios", { kind: "story", id: "HU-99" })).toBeNull();
    expect(botRequestPreview(runtime.state, "completar_criterios", { kind: "story", id: "HU-40" })?.plan).toContain("HU-40");
  });
});
