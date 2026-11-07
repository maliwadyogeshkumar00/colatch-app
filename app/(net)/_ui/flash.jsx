// Shows ?ok= / ?err= messages that Server Actions pass back through redirect().
export function flashUrl(path, key, msg) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
}
export default function Flash({ sp }) {
  if (!sp) return null;
  return (
    <>
      {sp.ok && <div className="note good" role="status">{sp.ok}</div>}
      {sp.err && <div className="note bad" role="alert">{sp.err}</div>}
    </>
  );
}
