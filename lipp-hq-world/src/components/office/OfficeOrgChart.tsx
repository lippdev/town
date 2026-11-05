import type { CSSProperties } from "react";
import { ORG_OWNER, buildOrgChart } from "@/agents/organization";
import { stateLabel } from "@/components/hud/fleetView";
import type { OfficeBot } from "@/world/office/officeRoster";
import { AgentPortrait } from "./AgentPortrait";

function AgentNode({ bot, sheet, showRole = true, onOpen }: {
  bot: OfficeBot;
  sheet?: string;
  /** Dentro de um subgrupo o título já diz a função. */
  showRole?: boolean;
  onOpen: (botId: string) => void;
}) {
  return (
    <button type="button" className="org-node" data-org-node={bot.id} title={`Conversar com ${bot.name}`} onClick={() => onOpen(bot.id)}>
      <span className="office-agent-avatar" style={{ "--agent-color": bot.color } as CSSProperties} aria-hidden>
        {sheet ? <AgentPortrait botId={bot.id} sheet={sheet} /> : <span>{bot.name.slice(0, 2)}</span>}
      </span>
      <span className="org-node-text"><strong>{bot.name}</strong>{showRole && <small>{bot.role}</small>}</span>
      {bot.live && bot.state && <span className="org-node-state">{stateLabel(bot.state)}</span>}
    </button>
  );
}

/** Quem responde a quem e como a equipe se divide. Clicar em um agente abre a conversa com ele. */
export function OfficeOrgChart({ bots, sheets, onOpen }: {
  bots: readonly OfficeBot[];
  sheets: Record<string, string>;
  onOpen: (botId: string) => void;
}) {
  const { leadership, teams, unassigned } = buildOrgChart(bots);
  const node = (bot: OfficeBot) => <AgentNode key={bot.id} bot={bot} sheet={sheets[bot.id]} onOpen={onOpen} />;
  return (
    <section className="org" aria-label="Equipe" data-org data-scene-keys-off>
      <header className="org-head">
        <h2>Equipe</h2>
        <p>Organização definida no HQ, não informada pelo Hermes. Clique em um agente para conversar.</p>
      </header>
      <div className="org-scroll">
        <div className="org-chart">
          <div className="org-node owner" data-org-owner>
            <span className="office-account-initial" aria-hidden>{ORG_OWNER.name.slice(0, 1)}</span>
            <span className="org-node-text"><strong>{ORG_OWNER.name}</strong><small>{ORG_OWNER.role}</small></span>
          </div>
          {leadership.map((bot) => (
            <div key={bot.id} className="org-tier"><span className="org-link" aria-hidden />{node(bot)}</div>
          ))}
          {teams.map((team) => (
            <div key={team.id} className="org-tier org-team-tier">
              <span className="org-link" aria-hidden />
              <section className="org-team" aria-label={`Equipe ${team.name}`} data-org-team={team.id}>
                <h3>{team.name} <span>{team.size}</span></h3>
                <div className="org-groups">
                  {team.groups.map((group) => (
                    <section key={group.id} className="org-group" aria-label={group.name} data-org-group={group.id}>
                      <h4>{group.name}</h4>
                      <div className="org-members">
                        {group.members.map((bot) => (
                          <AgentNode key={bot.id} bot={bot} sheet={sheets[bot.id]} showRole={false} onOpen={onOpen} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            </div>
          ))}
        </div>
        {unassigned.length > 0 && (
          <section className="org-team org-unassigned" aria-label="Sem equipe definida" data-org-unassigned>
            <header>
              <h3>Sem equipe definida <span>{unassigned.length}</span></h3>
              <p>O Hermes reportou estes bots, mas eles ainda não têm lugar na organização.</p>
            </header>
            <div className="org-members">{unassigned.map(node)}</div>
          </section>
        )}
        {bots.length === 0 && <p className="conv-empty">Nenhum agente disponível agora.</p>}
      </div>
    </section>
  );
}
