import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ActivityState } from "@/activity/events";
import { HEALTH_LABEL } from "@/activity/selectors";
import { ageLabel, whenLabel } from "@/activity/time";
import { EPIC_STATUS_LABEL, STORY_STATUS_LABEL, TRACK_LABEL } from "@/activity/types";
import { PrLine } from "./TechHud";
import { HEALTH_COLOR } from "./techPlaces";
import { useTechStore } from "./techStore";
import { attentionExpansion, attentionOnly, fullExpansion, needsAttention, projectTree, type EpicNode, type ProjectNode, type StoryNode } from "./techViews";
import { Flag, HealthBadge, openSubject, riskLabel, useNow, ViewHead, Who } from "./viewParts";

/**
 * A visão Projetos: a árvore do Notion (Projeto → Épico → HU → critérios), com as propriedades de
 * cada nível em colunas, como uma base do Notion. Abrir um épico ou HU abre a gaveta do prédio.
 */
function Toggle({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className="tv-toggle" aria-expanded={open} aria-label={`${open ? "Recolher" : "Expandir"} ${label}`} onClick={onToggle}>
      <ChevronRight size={14} aria-hidden />
    </button>
  );
}

function StoryRow({ node, open, onToggle, state }: { node: StoryNode; open: boolean; onToggle: () => void; state: ActivityState }) {
  const { story } = node;
  const selected = useTechStore((store) => store.selectedEpicId === story.epicId && store.highlightStoryId === story.id);
  return (
    <li
      className={selected ? "tv-node tv-story current" : "tv-node tv-story"}
      data-tree-story={story.id}
      data-blocked={node.blocked ? "true" : undefined}
      data-stale={node.stale ? "true" : undefined}
      data-no-criteria={node.withoutCriteria ? "true" : undefined}
      role="treeitem"
      aria-level={3}
      aria-expanded={open}
      aria-selected={selected}
    >
      <div className="tv-row">
        <span className="tv-name">
          <Toggle open={open} label={story.id} onToggle={onToggle} />
          <button type="button" className="tv-open" onClick={() => openSubject(state, { kind: "story", id: story.id })} title={`${story.id} · ${story.title}: abrir no épico`}>
            <span className="tv-id">{story.id}</span> {story.title}
          </button>
        </span>
        <span className="tv-cell" data-label="Responsável">
          <Who person={node.assignee} />
        </span>
        <span className="tv-cell" data-label="Status">
          {STORY_STATUS_LABEL[story.status]}
        </span>
        <span className="tv-cell tv-flags" data-label="Sinais">
          {node.blocked && (
            <Flag tone="red">
              Travada {ageLabel(state.at - node.blocked.since)}
              {node.blocked.waitingOn ? ` · espera ${node.blocked.waitingOn.name.split(" ")[0]}` : ""}
            </Flag>
          )}
          {node.stale && <Flag tone="amber">Parada {ageLabel(state.at - story.updatedAt)}</Flag>}
          {node.withoutCriteria && <Flag tone="amber">Sem critério</Flag>}
          {node.risks.map((risk) => (
            <Flag key={risk.text} tone={risk.kind === "ci-quebrado" ? "red" : "amber"} title={risk.text}>
              {riskLabel(risk)}
            </Flag>
          ))}
          {!needsAttention(node) && <span className="tv-dim">—</span>}
        </span>
        <span className="tv-cell" data-label="Critérios">
          {story.criteria.length ? `${node.criteriaDone}/${story.criteria.length} critérios` : <span className="tv-dim">sem critério</span>}
        </span>
        <span className="tv-cell" data-label="PRs">
          {node.prs.length ? node.prs.map((pr) => `#${pr.number}`).join(" ") : <span className="tv-dim">—</span>}
        </span>
      </div>
      {open && (
        <div className="tv-detail">
          {node.blocked && (
            <p className="tv-blocked">
              Travada desde {whenLabel(node.blocked.since, state.at)}
              {node.blocked.waitingOn ? `, esperando ${node.blocked.waitingOn.name}` : ""}: {node.blocked.reason}
            </p>
          )}
          <h4>Critérios de aceite</h4>
          {story.criteria.length ? (
            <ul className="tv-criteria" data-criteria={story.id}>
              {story.criteria.map((criterion) => (
                <li key={criterion.id} className={criterion.done ? "done" : undefined} data-criterion-done={criterion.done ? "true" : "false"}>
                  <span className="tv-check" aria-label={criterion.done ? "marcado" : "não marcado"} role="img">
                    {criterion.done ? "✓" : ""}
                  </span>
                  {criterion.text}
                  {criterion.suggestedBy && <em> · sugestão do {criterion.suggestedBy === "atlas" ? "Atlas" : criterion.suggestedBy}, a revisar</em>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tv-dim tv-note">{story.status === "backlog" ? "Ainda no backlog: critério pode esperar." : "Nenhum critério: ninguém sabe dizer quando acaba."}</p>
          )}
          <h4>PRs</h4>
          {node.prs.length ? (
            <ul className="tech-list">
              {node.prs.map((pr) => (
                <PrLine key={pr.number} state={state} pr={pr} detailed />
              ))}
            </ul>
          ) : (
            <p className="tv-dim tv-note">Nenhum PR cita {story.id}.</p>
          )}
        </div>
      )}
    </li>
  );
}

function EpicRow({ node, expanded, toggle, state }: { node: EpicNode; expanded: Set<string>; toggle: (id: string) => void; state: ActivityState }) {
  const { epic, health } = node;
  const open = expanded.has(epic.id);
  const selected = useTechStore((store) => store.selectedEpicId === epic.id);
  return (
    <li className={selected ? "tv-node tv-epic current" : "tv-node tv-epic"} data-tree-epic={epic.id} data-health={health.level} role="treeitem" aria-level={2} aria-expanded={open} aria-selected={selected}>
      <div className="tv-row">
        <span className="tv-name">
          <Toggle open={open} label={`${epic.id} ${epic.title}`} onToggle={() => toggle(epic.id)} />
          <button type="button" className="tv-open" onClick={() => openSubject(state, { kind: "epic", id: epic.id })} title={`${epic.id} · ${epic.title}: abrir o épico`}>
            <span className="tv-id">{epic.id}</span> {epic.title}
          </button>
        </span>
        <span className="tv-cell" data-label="Responsável">
          <Who person={node.owner} />
        </span>
        <span className="tv-cell" data-label="Etapa">
          <span className={`tv-track tv-track-${node.track}`}>{TRACK_LABEL[node.track]}</span> {EPIC_STATUS_LABEL[epic.status]}
        </span>
        <span className="tv-cell" data-label="Saúde">
          <HealthBadge level={health.level} />
        </span>
        <span className="tv-cell" data-label="HUs">
          {health.done}/{health.total} HUs concluídas
        </span>
        <span className="tv-cell" data-label="Entrega">
          {whenLabel(epic.due, state.at)}
        </span>
      </div>
      {open && (
        <ul role="group" className="tv-children">
          {node.stories.map((story) => (
            <StoryRow key={story.story.id} node={story} open={expanded.has(story.story.id)} onToggle={() => toggle(story.story.id)} state={state} />
          ))}
          {node.stories.length === 0 && <li className="tech-empty">Nenhuma HU {node.health.level === "no-prazo" ? "neste épico" : "marcada neste épico"}.</li>}
        </ul>
      )}
    </li>
  );
}

function ProjectRow({ node, expanded, toggle, state }: { node: ProjectNode; expanded: Set<string>; toggle: (id: string) => void; state: ActivityState }) {
  const open = expanded.has(node.project.id);
  const { summary } = node;
  return (
    <li className="tv-node tv-project" data-tree-project={node.project.id} role="treeitem" aria-level={1} aria-expanded={open}>
      <div className="tv-row">
        <span className="tv-name">
          <Toggle open={open} label={node.project.name} onToggle={() => toggle(node.project.id)} />
          <strong>{node.project.name}</strong>
        </span>
        <span className="tv-cell" data-label="Responsável">
          <Who person={node.owner} />
        </span>
        <span className="tv-cell" data-label="Épicos">
          {node.epics.length} {node.epics.length === 1 ? "épico" : "épicos"}
        </span>
        <span className="tv-cell tv-flags" data-label="Saúde">
          {(["travado", "em-risco", "no-prazo"] as const)
            .filter((level) => summary.health[level] > 0)
            .map((level) => (
              <span key={level} className={`tv-health tv-health-${level}`}>
                <span className="tv-dot" style={{ background: HEALTH_COLOR[level] }} aria-hidden />
                {summary.health[level]} {HEALTH_LABEL[level].toLocaleLowerCase("pt-BR")}
              </span>
            ))}
          {summary.blocked > 0 && <Flag tone="red">{summary.blocked} HU travada{summary.blocked > 1 ? "s" : ""}</Flag>}
          {summary.withoutCriteria > 0 && <Flag tone="amber">{summary.withoutCriteria} sem critério</Flag>}
        </span>
        <span className="tv-cell" data-label="HUs">
          {summary.done}/{summary.stories} HUs concluídas
        </span>
        <span className="tv-cell tv-empty-cell" aria-hidden />
      </div>
      {open && (
        <ul role="group" className="tv-children">
          {node.epics.map((epic) => (
            <EpicRow key={epic.epic.id} node={epic} expanded={expanded} toggle={toggle} state={state} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ProjectsView() {
  const state = useNow();
  const tree = useMemo(() => projectTree(state), [state]);
  const [onlyAttention, setOnlyAttention] = useState(false);
  // Abre de cara o que pede atenção; depois, quem manda é a pessoa.
  const [expanded, setExpanded] = useState<Set<string>>(() => attentionExpansion(projectTree(useTechStore.getState().state)));
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shown = onlyAttention ? attentionOnly(tree) : tree;
  return (
    <>
      <ViewHead
        title="Projetos"
        tools={
          <>
            <div className="tv-filter" role="group" aria-label="Filtro">
              <button type="button" aria-pressed={!onlyAttention} className={!onlyAttention ? "active" : undefined} onClick={() => setOnlyAttention(false)} data-tree-filter="tudo">
                Tudo
              </button>
              <button type="button" aria-pressed={onlyAttention} className={onlyAttention ? "active" : undefined} onClick={() => setOnlyAttention(true)} data-tree-filter="atencao">
                Pede atenção
              </button>
            </div>
            <button type="button" className="office-button" onClick={() => setExpanded(fullExpansion(tree))} data-tree-expand-all>
              Expandir tudo
            </button>
            <button type="button" className="office-button" onClick={() => setExpanded(new Set())} data-tree-collapse-all>
              Recolher
            </button>
          </>
        }
      >
        Notion: Projeto → Épico → HU → critérios de aceite, com os PRs do GitHub
      </ViewHead>
      <div className="tv-scroll">
        <div className="tv-table" data-tree>
          <div className="tv-row tv-columns" aria-hidden>
            <span>Nome</span>
            <span>Responsável</span>
            <span>Status</span>
            <span>Saúde e sinais</span>
            <span>Progresso</span>
            <span>Prazo e PRs</span>
          </div>
          <ul role="tree" aria-label="Projetos, épicos e HUs" className="tv-tree">
            {shown.map((project) => (
              <ProjectRow key={project.project.id} node={project} expanded={expanded} toggle={toggle} state={state} />
            ))}
            {shown.length === 0 && <li className="tech-empty">Nada pede atenção agora.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
