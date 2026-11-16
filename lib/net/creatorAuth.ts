import { cookies } from 'next/headers';
import { makeSession, readSession, sessionSecret, hashPassword } from './auth';
import { env } from './env';
import { can, type Perm } from './security';

export const CREATOR_COOKIE = 'cr_session';
export const TEAM_COOKIE = 'tm_session';

// Cookie subject = "<prefix>_<id>~<session_version>". The prefix keeps a team cookie from passing as a
// creator one; the version lets us sign someone out everywhere by bumping it in the database.
function parseSubject(raw: string | null, prefix: 'cr' | 'tm'): { id: string; v: number } | null {
  if (!raw || !raw.startsWith(prefix + '_')) return null;
  const body = raw.slice(prefix.length + 1);
  const [id, v] = body.split('~');
  if (!id) return null;
  return { id, v: Number(v || 1) };
}

/** Logged-in creator (account + creator row) or null. */
export async function currentCreator(): Promise<{ accountId: string; email: string; creator: any } | null> {
  const sub = parseSubject(await readSession(await sessionSecret(env), cookies().get(CREATOR_COOKIE)?.value), 'cr');
  if (!sub) return null;
  const acc = await env.DB.prepare('SELECT id, email, creator_id, session_version FROM creator_accounts WHERE id = ?').bind(sub.id).first<any>();
  if (!acc || Number(acc.session_version || 1) !== sub.v) return null;
  const creator = await env.DB.prepare('SELECT * FROM creators WHERE id = ?').bind(acc.creator_id).first<any>();
  if (!creator) return null;
  return { accountId: acc.id, email: acc.email, creator };
}

/** Call only from a Server Action or Route Handler. */
export async function startCreatorSession(accountId: string, days = 30) {
  const acc = await env.DB.prepare('SELECT session_version FROM creator_accounts WHERE id = ?').bind(accountId).first<any>();
  const token = await makeSession(await sessionSecret(env), `cr_${accountId}~${Number(acc?.session_version || 1)}`, days);
  cookies().set(CREATOR_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: days * 86400 });
}

export type TeamMember = { id: string; email: string; name: string | null; role: string };

/** Colatch team member or null (disabled members and old sessions are rejected). */
export async function currentTeam(): Promise<TeamMember | null> {
  const sub = parseSubject(await readSession(await sessionSecret(env), cookies().get(TEAM_COOKIE)?.value), 'tm');
  if (!sub) return null;
  const me = await env.DB.prepare('SELECT id, email, name, role, session_version, disabled_at FROM team_users WHERE id = ?').bind(sub.id).first<any>();
  if (!me || me.disabled_at || Number(me.session_version || 1) !== sub.v) return null;
  return { id: me.id, email: me.email, name: me.name, role: me.role };
}

/** Team member with the given permission, or null. Use inside every team Server Action. */
export async function teamWith(perm: Perm): Promise<TeamMember | null> {
  const me = await currentTeam().catch(() => null);
  return me && can(me.role, perm) ? me : null;
}

export async function startTeamSession(userId: string, days = 14) {
  const me = await env.DB.prepare('SELECT session_version FROM team_users WHERE id = ?').bind(userId).first<any>();
  const token = await makeSession(await sessionSecret(env), `tm_${userId}~${Number(me?.session_version || 1)}`, days);
  cookies().set(TEAM_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: days * 86400 });
}

/** Signs a person out on every device. */
export async function revokeSessions(kind: 'creator' | 'team', id: string) {
  const table = kind === 'creator' ? 'creator_accounts' : 'team_users';
  await env.DB.prepare(`UPDATE ${table} SET session_version = session_version + 1 WHERE id = ?`).bind(id).run();
}

export { hashPassword };
