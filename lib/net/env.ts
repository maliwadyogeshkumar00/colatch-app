import { db } from './db';

/**
 * Stand-in for the Cloudflare `env` the original build was written against:
 * env.DB is the Neon adapter, everything else comes from Vercel environment variables.
 */
export const env: Env = new Proxy({ DB: db } as any, {
  get(target, key: string) {
    if (key in target) return target[key];
    return process.env[key];
  },
});
