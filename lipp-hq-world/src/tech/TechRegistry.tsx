import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link2, Unlink, UserCog, X } from "lucide-react";
import { identityCoverage, unidentifiedLogins } from "@/activity/identity";
import { ROLE_LABEL, type Person } from "@/activity/types";
import { useDrawerInset } from "@/components/office/OfficeHud";
import { useOfficeStore } from "@/world/office/officeStore";
import { squadHumanId } from "./techPeople";
import { useTechStore } from "./techStore";
import "./tech-actions.css";

/**
 * O cadastro do squad: e-mail corporativo, nome, papel e o GitHub vinculado ou não. É uma gaveta, não
 * uma quarta visão: não responde a pergunta da daily, é o lugar de arrumar a identidade, e assim abre
 * de qualquer visão (e do aviso na gaveta da pessoa) sem tirar o que está por baixo.
 *
 * Na demonstração o login é digitado. Com os conectores, o vínculo vira "Entrar com GitHub" (OAuth):
 * a pessoa entra na própria conta e o login chega confirmado, sem digitação. O resto não muda: o
 * vínculo é a ação `vincular_github`, que passa por `ActivityRuntime.perform`.
 */

const norm = (login: string) => login.trim().replace(/^@/, "").toLocaleLowerCase();

/** O botão da barra de cima. Com o cadastro aberto, o mesmo botão fecha. */
export function TechRegistryButton() {
  const open = useTechStore((store) => store.registry !== null);
  return (
    <button
      type="button"
      className="tech-registry-button"
      aria-expanded={open}
      aria-controls={open ? "tech-registry" : undefined}
      title="Cadastro do squad: e-mail, papel e GitHub"
      data-registry-button
      onClick={() => (open ? useTechStore.getState().closeRegistry() : useTechStore.getState().openRegistry())}
    >
      <UserCog size={14} aria-hidden />
      <span>Cadastro</span>
    </button>
  );
}

function PersonEntry({ person, editing, unlinking, onEdit, onUnlink, onDone, prefill }: { person: Person; editing: boolean; unlinking: boolean; onEdit: (prefill?: string) => void; onUnlink: () => void; onDone: () => void; prefill: string }) {
  const [login, setLogin] = useState(prefill);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const confirmUnlink = useRef<HTMLButtonElement | null>(null);
  const formId = `cadastro-${person.email.replace(/[^a-z0-9]+/gi, "-")}`;
  useEffect(() => {
    if (!editing) return;
    setLogin(prefill);
    setProblem(null);
    input.current?.focus();
  }, [editing, prefill]);
  useEffect(() => {
    if (unlinking) confirmUnlink.current?.focus();
  }, [unlinking]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!norm(login)) {
      setProblem("Digite o login do GitHub. Para tirar o vínculo, use Desvincular.");
      input.current?.focus();
      return;
    }
    const result = useTechStore.getState().perform({ kind: "vincular_github", email: person.email, login });
    if (result.ok) onDone();
    else {
      setProblem(result.problem);
      input.current?.focus();
    }
  };
  const first = person.name.split(" ")[0];
  return (
    <>
      <div className="tr-person-head">
        <strong>{person.name}</strong>
        <small>
          {person.title} · {ROLE_LABEL[person.role]}
        </small>
      </div>
      <span className="tr-email">{person.email}</span>
      <ul className="tr-sources" aria-label="Fontes que reconhecem a pessoa">
        <li>Notion</li>
        <li>Slack</li>
        <li>Microsoft 365</li>
        <li className={person.github ? undefined : "missing"} data-registry-github={person.github ?? ""}>
          {person.github ? `GitHub @${person.github}` : "GitHub não vinculado"}
        </li>
      </ul>
      <div className="ta-bar">
        <button type="button" className="ta-trigger" aria-expanded={editing} aria-controls={editing ? formId : undefined} onClick={() => onEdit()} data-registry-edit={person.email}>
          <Link2 size={13} aria-hidden /> {person.github ? "Trocar login" : "Vincular GitHub"}
        </button>
        {person.github && (
          <button type="button" className="ta-trigger" aria-expanded={unlinking} onClick={onUnlink} data-registry-unlink={person.email}>
            <Unlink size={13} aria-hidden /> Desvincular
          </button>
        )}
        <button type="button" className="ta-trigger" onClick={() => useOfficeStore.getState().selectHuman(squadHumanId(person.email))}>
          Ver {first}
        </button>
      </div>
      {editing && (
        <form id={formId} className="tr-form ta-panel" onSubmit={submit} data-registry-form={person.email} noValidate>
          <label htmlFor={`${formId}-login`}>Login do GitHub de {person.name}</label>
          <div className="tr-input" data-invalid={problem ? "true" : undefined}>
            <span aria-hidden>@</span>
            <input
              ref={input}
              id={`${formId}-login`}
              value={login}
              onChange={(event) => {
                setLogin(event.target.value);
                setProblem(null);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              aria-invalid={problem ? true : undefined}
              aria-describedby={`${formId}-hint${problem ? ` ${formId}-error` : ""}`}
              data-registry-login
            />
          </div>
          {problem && (
            <p className="tr-error" id={`${formId}-error`} role="alert" data-registry-error>
              {problem}
            </p>
          )}
          <p className="ta-note" id={`${formId}-hint`}>
            Na demonstração o login é digitado. Com os conectores, {first} clica em "Entrar com GitHub" (OAuth) e o login chega confirmado pelo próprio GitHub.
          </p>
          <div className="ta-buttons">
            <button type="submit" className="office-button primary" data-registry-submit>
              Vincular
            </button>
            <button type="button" className="office-button" onClick={onDone}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {unlinking && person.github && (
        <div className="ta-panel" role="group" aria-label={`Desvincular o GitHub de ${person.name}`} data-registry-unlink-panel>
          <p className="ta-why">
            Desvincular @{person.github} de {person.name}? Os PRs e revisões desse login voltam a aparecer como "autor não identificado" e saem da carga de {first}.
          </p>
          <div className="ta-buttons">
            <button
              ref={confirmUnlink}
              type="button"
              className="office-button primary"
              onClick={() => {
                if (useTechStore.getState().perform({ kind: "vincular_github", email: person.email, login: "" }).ok) onDone();
              }}
              data-registry-unlink-confirm
            >
              Desvincular
            </button>
            <button type="button" className="office-button" onClick={onDone}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** A gaveta do cadastro. Esc fecha o formulário aberto antes; depois, a gaveta. */
export function RegistryDrawer() {
  const registry = useTechStore((store) => store.registry);
  const state = useTechStore((store) => store.state);
  const node = useDrawerInset(Boolean(registry));
  const [editing, setEditing] = useState<{ email: string; prefill: string } | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  useEffect(() => {
    setUnlinking(null);
    const focus = registry?.focus ?? null;
    setEditing(focus ? { email: focus, prefill: "" } : null);
    if (registry) {
      const target = focus ? node.current?.querySelector<HTMLElement>(`[data-registry-person="${focus}"]`) : node.current?.querySelector<HTMLElement>(".panel-close");
      target?.scrollIntoView({ block: "nearest" });
      if (!focus) target?.focus({ preventScroll: true });
    }
  }, [registry, node]);
  if (!registry) return null;
  const coverage = identityCoverage(state.people);
  const logins = unidentifiedLogins(state.people, state.prs);
  const withoutGithub = state.people.filter((person) => !person.github);
  const total = state.people.length;
  const github = coverage.filter((entry) => entry.sources.github).length;
  const backTo = (email: string) => node.current?.querySelector<HTMLElement>(`[data-registry-edit="${email}"]`)?.focus();
  const done = (email: string) => {
    setEditing(null);
    setUnlinking(null);
    requestAnimationFrame(() => backTo(email));
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    const open = editing?.email ?? unlinking;
    if (open) done(open);
    else useTechStore.getState().closeRegistry();
  };
  return (
    <aside ref={node} id="tech-registry" className="drawer office-demo-panel tech-drawer" aria-label="Cadastro do squad" data-tech-registry data-scene-keys-off onKeyDown={onKeyDown}>
      <header className="drawer-head">
        <div className="drawer-title">
          <strong>Cadastro do squad</strong>
          <span className="panel-tag">simulação</span>
          <button type="button" className="panel-close" onClick={() => useTechStore.getState().closeRegistry()} aria-label="Fechar (Esc)" title="Fechar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="drawer-sub">
          <span className="panel-role">E-mail corporativo, nome, papel e GitHub de cada pessoa</span>
        </div>
      </header>
      <div className="drawer-body">
        <p className="tr-intro">O e-mail corporativo é a chave: Notion, Slack e Microsoft 365 já reconhecem cada pessoa por ele. O GitHub é pessoal, e só vira pessoa quando o login é vinculado aqui; o que já aconteceu passa a contar também.</p>
        <ul className="tr-coverage" aria-label="Quem cada fonte reconhece" data-registry-coverage>
          <li>
            Notion <strong>{total}/{total}</strong>
          </li>
          <li>
            Slack <strong>{total}/{total}</strong>
          </li>
          <li>
            Microsoft 365 <strong>{total}/{total}</strong>
          </li>
          <li className={github < total ? "partial" : undefined} data-registry-github-count={github}>
            GitHub <strong>{github}/{total}</strong>
          </li>
        </ul>
        <section className="tech-section">
          <h3>
            Logins do GitHub sem pessoa <small>{logins.length}</small>
          </h3>
          {logins.length === 0 ? (
            <p className="tech-empty">Todo login visto no GitHub é de alguém do cadastro.</p>
          ) : (
            <ul className="tr-logins" data-registry-logins>
              {logins.map((entry) => {
                const prs = state.prs.filter((pr) => norm(pr.author) === norm(entry.login));
                return (
                  <li key={entry.login} className="tr-login" data-registry-unknown={entry.login}>
                    <span>
                      <code>{entry.login}</code> · {entry.prs} {entry.prs === 1 ? "PR" : "PRs"}
                      {entry.reviews ? `, ${entry.reviews} ${entry.reviews === 1 ? "revisão" : "revisões"}` : ""}
                    </span>
                    <small>{prs.map((pr) => `#${pr.number} ${pr.title}`).join(" · ")}</small>
                    {withoutGithub.length > 0 && (
                      <div className="ta-bar">
                        <small>De quem é?</small>
                        {withoutGithub.map((person) => (
                          <button key={person.email} type="button" className="ta-trigger" onClick={() => setEditing({ email: person.email, prefill: entry.login })} data-registry-suggest={person.email}>
                            {person.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="tech-section">
          <h3>
            Pessoas <small>{total}</small>
          </h3>
          <ul className="tr-people">
            {state.people.map((person) => (
              <li key={person.email} className={registry.focus === person.email ? "tr-person focus" : "tr-person"} data-registry-person={person.email}>
                <PersonEntry
                  person={person}
                  editing={editing?.email === person.email}
                  prefill={editing?.email === person.email ? editing.prefill : ""}
                  unlinking={unlinking === person.email}
                  onEdit={() => {
                    setUnlinking(null);
                    setEditing(editing?.email === person.email ? null : { email: person.email, prefill: "" });
                  }}
                  onUnlink={() => {
                    setEditing(null);
                    setUnlinking(unlinking === person.email ? null : person.email);
                  }}
                  onDone={() => done(person.email)}
                />
              </li>
            ))}
          </ul>
        </section>
        <p className="panel-warn">Pessoas e logins fictícios. O cadastro guarda só identidade: nenhuma mensagem, nenhum conteúdo.</p>
      </div>
    </aside>
  );
}
