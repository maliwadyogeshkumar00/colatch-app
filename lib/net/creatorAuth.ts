import { cookies } from 'next/headers';
import { makeSession, readSession, sessionSecret, hashPassword } from './auth';
import { env } from './env';

export const CREATOR_COOKIE = 'cr_session';
export const TEAM_COOKIE = 'tm_session';

/** Logged-in creator (account + creator row) or null. Session ids are prefixed so a team cookie can never pass as a creator one. */
export async function currentCreator(): Promise<{ accountId: string; email: string; creator: any } | null> {
  const raw = await readSession(await sessionSecret(env), cookies().get(CREATOR_COOKIE)?.value);
  if (!raw || !raw.startsWith('cr_')) return null;
  const accountId = raw.slice(3);
  const acc = await env.DB.prepare('SELECT a.id, a.email, a.creator_id FROM creator_accounts a WHERE a.id = ?').bind(accountId).first<{ id: string; email: string; creator_id: string }>();
  if (!acc) return null;
  const creator = await env.DB.prepare('SELECT * FROM creators WHERE id = ?').bind(acc.creator_id).first<any>();
  if (!creator) return null;
  return { accountId: acc.id, email: acc.email, creator };
}

/** Call only from a Server Action or Route Handler. */
export async function startCreatorSession(accountId: string, days = 30) {
  const token = await makeSession(await sessionSecret(env), `cr_${accountId}`, days);
  cookies().set(CREATOR_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: days * 86400 });
}

/** Colatch team member or null. */
export async function currentTeam(): Promise<{ id: string; email: string; name: string | null } | null> {
  const raw = await readSession(await sessionSecret(env), cookies().get(TEAM_COOKIE)?.value);
  if (!raw || !raw.startsWith('tm_')) return null;
  return env.DB.prepare('SELECT id, email, name FROM team_users WHERE id = ?').bind(raw.slice(3)).first<any>();
}

export async function startTeamSession(userId: string, days = 14) {
  const token = await makeSession(await sessionSecret(env), `tm_${userId}`, days);
  cookies().set(TEAM_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: days * 86400 });
}

export { hashPassword };
