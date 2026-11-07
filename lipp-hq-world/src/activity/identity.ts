import type { Actor, Person, PullRequest } from "./types";

/**
 * Identidade: o e-mail corporativo é a chave. Notion, Slack e Microsoft 365 já chegam com ele; o
 * GitHub chega com o login pessoal, e só vira pessoa se o login estiver vinculado no cadastro.
 * Quem não vinculou continua existindo nas outras fontes, e os PRs dele aparecem como "autor não
 * identificado" até o vínculo.
 */

export interface Directory {
  byEmail: ReadonlyMap<string, Person>;
  byGithub: ReadonlyMap<string, Person>;
}

const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase();
const normalizeLogin = (login: string) => login.trim().replace(/^@/, "").toLocaleLowerCase();

export function directoryOf(people: readonly Person[]): Directory {
  const byEmail = new Map<string, Person>();
  const byGithub = new Map<string, Person>();
  for (const person of people) {
    byEmail.set(normalizeEmail(person.email), person);
    if (person.github) byGithub.set(normalizeLogin(person.github), person);
  }
  return { byEmail, byGithub };
}

export const personByEmail = (directory: Directory, email: string | null | undefined) => (email ? directory.byEmail.get(normalizeEmail(email)) ?? null : null);
export const personByGithub = (directory: Directory, login: string | null | undefined) => (login ? directory.byGithub.get(normalizeLogin(login)) ?? null : null);

/** De um ator de qualquer fonte para a pessoa, quando dá. Bot e app não são pessoas. */
export function resolveActor(directory: Directory, actor: Actor): Person | null {
  if (actor.kind === "person") return personByEmail(directory, actor.email);
  if (actor.kind === "github") return personByGithub(directory, actor.login);
  return null;
}

/** Autor do PR, ou nulo: "autor não identificado", com o login à mostra para quem for vincular. */
export const prAuthor = (directory: Directory, pr: Pick<PullRequest, "author">) => personByGithub(directory, pr.author);

/** O mesmo formato de login que o GitHub aceita: letras, números e hífen, sem hífen nas pontas. */
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const CORPORATE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LinkProblem = "email-desconhecido" | "login-invalido" | "login-em-uso";

export const LINK_PROBLEM_LABEL: Record<LinkProblem, string> = {
  "email-desconhecido": "Esse e-mail não está no cadastro do squad.",
  "login-invalido": "Login do GitHub inválido: só letras, números e hífen, até 39.",
  "login-em-uso": "Esse login já está vinculado a outra pessoa.",
};

export const isCorporateEmail = (email: string) => CORPORATE_EMAIL.test(email.trim());

/**
 * Vincula (ou troca) o login do GitHub de quem tem o e-mail. Devolve o cadastro novo, ou o motivo
 * de não ter vinculado. Login vazio desfaz o vínculo.
 */
export function linkGithub(people: readonly Person[], email: string, login: string): { people: Person[] } | { problem: LinkProblem } {
  const key = normalizeEmail(email);
  if (!people.some((person) => normalizeEmail(person.email) === key)) return { problem: "email-desconhecido" };
  const clean = normalizeLogin(login);
  if (clean && !GITHUB_LOGIN.test(clean)) return { problem: "login-invalido" };
  if (clean && people.some((person) => person.github && normalizeLogin(person.github) === clean && normalizeEmail(person.email) !== key)) return { problem: "login-em-uso" };
  return { people: people.map((person) => (normalizeEmail(person.email) === key ? { ...person, github: clean || null } : person)) };
}

export interface IdentityCoverage {
  email: string;
  /** Fontes que já reconhecem a pessoa. Pelo e-mail, Notion, Slack e M365 sempre reconhecem. */
  sources: { notion: true; slack: true; m365: true; github: boolean };
}

export function identityCoverage(people: readonly Person[]): IdentityCoverage[] {
  return people.map((person) => ({ email: person.email, sources: { notion: true, slack: true, m365: true, github: Boolean(person.github) } }));
}

/** Logins que aparecem no GitHub e não são de ninguém do cadastro, com quantos PRs e revisões cada um. */
export function unidentifiedLogins(people: readonly Person[], prs: readonly PullRequest[]): Array<{ login: string; prs: number; reviews: number }> {
  const directory = directoryOf(people);
  const seen = new Map<string, { login: string; prs: number; reviews: number }>();
  const touch = (login: string, field: "prs" | "reviews") => {
    if (personByGithub(directory, login)) return;
    const key = normalizeLogin(login);
    const entry = seen.get(key) ?? { login, prs: 0, reviews: 0 };
    entry[field] += 1;
    seen.set(key, entry);
  };
  for (const pr of prs) {
    touch(pr.author, "prs");
    for (const review of pr.reviews) touch(review.by, "reviews");
  }
  return [...seen.values()].sort((a, b) => b.prs + b.reviews - (a.prs + a.reviews) || a.login.localeCompare(b.login));
}
