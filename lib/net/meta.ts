/**
 * Instagram (Meta Graph API) helpers.
 *
 * Needs, as Cloudflare Pages secrets:
 *   META_ACCESS_TOKEN  long-lived token for the Facebook Page linked to Colatch's
 *                      Instagram professional account (instagram_basic,
 *                      instagram_manage_comments, instagram_manage_messages,
 *                      pages_show_list, pages_read_engagement, business_management)
 *   META_IG_USER_ID    Colatch's Instagram professional account id (17841…)
 *   META_APP_SECRET    app secret, used to verify webhook signatures
 *   META_VERIFY_TOKEN  any string; typed into the Meta webhook setup screen
 *
 * Business Discovery only works for Business/Creator accounts and only when you
 * know the handle. Meta offers no search-by-niche/city endpoint; that search runs
 * on Colatch's own creators table.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export function metaReady(env: Env): boolean {
  return Boolean(env.META_ACCESS_TOKEN && env.META_IG_USER_ID);
}

export function cleanHandle(raw: string): string {
  let h = String(raw || '').trim();
  const m = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) h = m[1];
  return h.replace(/^@+/, '').replace(/\/.*$/, '').toLowerCase();
}

export interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  permalink?: string;
}

export interface IgProfile {
  handle: string;
  name: string | null;
  bio: string | null;
  website: string | null;
  profile_pic: string | null;
  followers: number;
  following: number;
  media_count: number;
  avg_likes: number;
  avg_comments: number;
  engagement_rate: number; // percent
  posts_per_week: number;
  reel_share: number;      // 0..1 of recent posts that are reels
  recent: IgMedia[];
}

async function graph<T>(path: string, env: Env, init?: RequestInit): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`, init);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error) {
    const msg = json?.error?.message || `Instagram API error (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

/** Public profile + last 24 posts of any Business/Creator account, by handle. */
export async function lookupProfile(env: Env, rawHandle: string): Promise<IgProfile> {
  if (!metaReady(env)) throw new Error('Instagram is not connected yet. Add META_ACCESS_TOKEN and META_IG_USER_ID in Cloudflare.');
  const handle = cleanHandle(rawHandle);
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new Error('That does not look like an Instagram handle.');
  const fields =
    `business_discovery.username(${handle}){username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,` +
    `media.limit(24){id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink}}`;
  let data: any;
  try {
    data = await graph<any>(`/${env.META_IG_USER_ID}?fields=${encodeURIComponent(fields)}`, env);
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/cannot be found|does not exist|Invalid user id|not a business/i.test(m))
      throw new Error(`@${handle} is private, personal, or doesn't exist. Instagram only shares data for public Business/Creator accounts.`);
    throw e;
  }
  const bd = data.business_discovery || {};
  const recent: IgMedia[] = bd.media?.data ?? [];
  const followers = Number(bd.followers_count || 0);
  const likes = recent.map((m) => m.like_count ?? 0);
  const comments = recent.map((m) => m.comments_count ?? 0);
  const avg = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);
  const avg_likes = avg(likes);
  const avg_comments = avg(comments);
  const er = followers ? ((avg_likes + avg_comments) / followers) * 100 : 0;
  let ppw = 0;
  if (recent.length > 1 && recent[0].timestamp && recent[recent.length - 1].timestamp) {
    const span = (Date.parse(recent[0].timestamp) - Date.parse(recent[recent.length - 1].timestamp!)) / 864e5;
    ppw = span > 0 ? (recent.length / span) * 7 : 0;
  }
  const reels = recent.filter((m) => m.media_product_type === 'REELS').length;
  return {
    handle: bd.username || handle,
    name: bd.name ?? null,
    bio: bd.biography ?? null,
    website: bd.website ?? null,
    profile_pic: bd.profile_picture_url ?? null,
    followers,
    following: Number(bd.follows_count || 0),
    media_count: Number(bd.media_count || 0),
    avg_likes: Math.round(avg_likes),
    avg_comments: Math.round(avg_comments),
    engagement_rate: Math.round(er * 100) / 100,
    posts_per_week: Math.round(ppw * 10) / 10,
    reel_share: recent.length ? reels / recent.length : 0,
    recent,
  };
}

/** Public reply under a comment on Colatch's own post. */
export async function replyToComment(env: Env, commentId: string, message: string) {
  return graph(`/${commentId}/replies`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

/** Private reply (DM) to the person who commented. Allowed once per comment, within 7 days. */
export async function privateReplyToComment(env: Env, commentId: string, text: string) {
  return graph(`/${env.META_IG_USER_ID}/messages`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });
}

/** DM reply to someone who messaged Colatch (24-hour window). */
export async function sendDm(env: Env, igsid: string, text: string) {
  return graph(`/${env.META_IG_USER_ID}/messages`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
  });
}

/** Verify X-Hub-Signature-256 on webhook POSTs. */
export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
