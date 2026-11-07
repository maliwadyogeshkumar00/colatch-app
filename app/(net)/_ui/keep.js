// Carry non-secret form values across a redirect so a failed submit doesn't wipe the form.
export function packForm(fd, skip = ["password"]) {
  const v = {};
  for (const k of new Set(fd.keys())) if (!skip.includes(k) && !k.startsWith("$ACTION")) v[k] = fd.getAll(k).map(String).join(", ");
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}
export function unpackForm(s) {
  try { return s ? JSON.parse(Buffer.from(String(s), "base64url").toString()) : {}; } catch { return {}; }
}
