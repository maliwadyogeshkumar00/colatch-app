// Minimal Postgres client with the slice of the `pg` API that lib/net/db.js uses
// (Pool, connect/release, query(text, params) -> {rows, rowCount, fields}, error .code/.constraint).
// Only for running integration tests on a machine without npm access; CI uses the real `pg`.
// Trust/password-less auth on localhost only.
import net from "node:net";

class PgError extends Error {}

function parseUrl(u) {
  const x = new URL(u);
  return { host: x.hostname, port: Number(x.port || 5432), user: decodeURIComponent(x.username || "postgres"), database: x.pathname.slice(1) || "postgres" };
}

class Client {
  constructor(cfg) { this.cfg = cfg; this.buf = Buffer.alloc(0); this.waiters = []; this.queue = Promise.resolve(); }
  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.connect(this.cfg.port, this.cfg.host);
      this.sock.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
      this.sock.on("error", reject);
      this.sock.on("connect", async () => {
        const params = Buffer.from(`user\0${this.cfg.user}\0database\0${this.cfg.database}\0\0`);
        const len = Buffer.alloc(8); len.writeInt32BE(8 + params.length, 0); len.writeInt32BE(196608, 4);
        this.sock.write(Buffer.concat([len, params]));
        try { await this.until("Z"); resolve(this); } catch (e) { reject(e); }
      });
    });
  }
  pump() {
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) return;
      const type = String.fromCharCode(this.buf[0]);
      const body = this.buf.subarray(5, len + 1);
      this.buf = this.buf.subarray(len + 1);
      this.msgs = this.msgs || [];
      this.msgs.push({ type, body });
      const w = this.waiters.shift(); if (w) w();
    }
  }
  next() {
    return new Promise((r) => { if (this.msgs?.length) r(this.msgs.shift()); else this.waiters.push(() => r(this.msgs.shift())); });
  }
  async until(stop) {
    const out = [];
    let err = null;
    for (;;) {
      const m = await this.next();
      if (m.type === "E") err = errorFrom(m.body);
      else if (m.type === "R" && m.body.readInt32BE(0) !== 0) err = new PgError("pg-wire stub: only trust auth is supported");
      else out.push(m);
      if (m.type === stop) break;
    }
    if (err) throw err;
    return out;
  }
  msg(type, body) { const h = Buffer.alloc(5); h.write(type, 0); h.writeInt32BE(body.length + 4, 1); return Buffer.concat([h, body]); }
  query(text, values = []) {
    const run = async () => {
      const cstr = (s) => Buffer.from(s + "\0");
      const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
      const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
      const parts = [i16(0), i16(values.length)];
      for (const v of values) {
        if (v === null || v === undefined) parts.push(i32(-1));
        else { const s = Buffer.from(v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v)); parts.push(i32(s.length), s); }
      }
      parts.push(i16(0));
      this.sock.write(Buffer.concat([
        this.msg("P", Buffer.concat([cstr(""), cstr(text), i16(0)])),
        this.msg("B", Buffer.concat([cstr(""), cstr(""), ...parts])),
        this.msg("D", Buffer.concat([Buffer.from("P"), cstr("")])),
        this.msg("E", Buffer.concat([cstr(""), i32(0)])),
        this.msg("S", Buffer.alloc(0)),
      ]));
      const msgs = await this.until("Z");
      let fields = [], rows = [], rowCount = 0;
      for (const m of msgs) {
        if (m.type === "T") {
          const n = m.body.readInt16BE(0); let o = 2; fields = [];
          for (let i = 0; i < n; i++) { const e = m.body.indexOf(0, o); const name = m.body.toString("utf8", o, e); o = e + 1; const oid = m.body.readInt32BE(o + 6); o += 18; fields.push({ name, dataTypeID: oid }); }
        } else if (m.type === "D") {
          const n = m.body.readInt16BE(0); let o = 2; const r = {};
          for (let i = 0; i < n; i++) { const l = m.body.readInt32BE(o); o += 4; let v = null; if (l >= 0) { v = m.body.toString("utf8", o, o + l); o += l; } r[fields[i].name] = conv(v, fields[i].dataTypeID); }
          rows.push(r);
        } else if (m.type === "C") { const t = m.body.toString("utf8", 0, m.body.length - 1); const num = Number(t.split(" ").pop()); rowCount = isFinite(num) ? num : 0; }
      }
      return { rows, rowCount, fields };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  release() { this.pool?._free.push(this); }
  end() { try { this.sock.write(this.msg("X", Buffer.alloc(0))); this.sock.end(); } catch {} }
}

function conv(v, oid) {
  if (v == null) return null;
  if (oid === 16) return v === "t";
  if (oid === 1184 || oid === 1114) return new Date(v.replace(" ", "T") + (oid === 1114 ? "Z" : ""));
  if (oid === 114 || oid === 3802) return JSON.parse(v);
  return v;
}

function errorFrom(body) {
  const f = {}; let o = 0;
  while (o < body.length && body[o] !== 0) { const k = String.fromCharCode(body[o]); const e = body.indexOf(0, o + 1); f[k] = body.toString("utf8", o + 1, e); o = e + 1; }
  const err = new PgError(f.M || "postgres error");
  err.code = f.C; err.constraint = f.n; err.detail = f.D; err.table = f.t;
  return err;
}

class Pool {
  constructor(opts) { this.cfg = parseUrl(opts.connectionString); this._free = []; this._all = []; }
  on() {}
  async connect() {
    const c = this._free.pop() || (await new Client(this.cfg).connect());
    c.pool = this; if (!this._all.includes(c)) this._all.push(c);
    return c;
  }
  async query(text, values) { const c = await this.connect(); try { return await c.query(text, values); } finally { c.release(); } }
  async end() { for (const c of this._all) c.end(); this._all = []; this._free = []; }
}

export default { Pool };
export { Pool };
