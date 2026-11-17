// Messages inside one deal. Server component: the form posts to the page's own Server Action,
// which checks who is posting. `hidden` carries the fields that action needs (id/token/deal).
import { MAX_MESSAGE, SENDER_LABEL } from "@/lib/net/messages";
import { toDate } from "@/lib/net/usage";

const when = (v) => {
  const d = toDate(v);
  return !d ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

/**
 * @param messages rows from deal_messages, oldest first
 * @param me which side is reading ("creator" | "brand" | "team")
 * @param unread messages from others since this reader last opened the deal
 * @param action Server Action to post with; omit (or canPost=false) for read-only viewers
 * @param mid one-time id for this render of the form (double-submit safety)
 * @param names optional display names per side, e.g. { brand: "Acme" }
 */
export default function DealThread({ messages = [], me, unread = 0, action, canPost = true, hidden = [], mid, names = {}, readOnlyNote, id, title = "Messages", compact = false }) {
  const label = (m) => (m.sender_kind === me && me !== "team" ? "You" : m.sender_kind === "team" && me === "team" ? (m.sender_id || SENDER_LABEL.team) : names[m.sender_kind] || SENDER_LABEL[m.sender_kind] || m.sender_kind);
  const scrubNote = me === "team" ? "Contact details were hidden from this message." : "Contact details were hidden. Keep the deal on Colatch: it's how your payment stays protected.";
  const fieldId = `dr-msg-${id || "deal"}`;
  return (
    <section className={`dr-thread${compact ? " dr-compact" : ""}`} id={id} aria-label={title}>
      <div className="spread"><h2 style={{ margin: 0 }}>{title}</h2>{unread > 0 && <span className="pill dr-new">{unread} new</span>}</div>
      {messages.length ? (
        <ol className="dr-msgs">
          {messages.map((m) => (
            <li key={m.id} className={`dr-msg dr-${m.sender_kind}${m.sender_kind === me ? " dr-mine" : ""}`}>
              <div className="dr-meta"><b>{label(m)}</b><span>{when(m.created_at)}</span></div>
              <div className="dr-body">{m.body}</div>
              {m.scrubbed ? <div className="dr-scrub">{scrubNote}</div> : null}
            </li>
          ))}
        </ol>
      ) : <p className="hint" style={{ margin: "10px 0 0" }}>No messages yet. {me === "brand" ? "Ask the creator or the Colatch team anything about this deal." : me === "creator" ? "Ask the brand or the Colatch team anything about this deal." : "Messages from the creator and the brand show here."}</p>}
      {action && canPost ? (
        <form action={action} className="dr-form">
          {hidden.map(([n, v]) => <input key={n} type="hidden" name={n} value={v} />)}
          <input type="hidden" name="mid" value={mid} />
          <textarea id={fieldId} aria-label="Your message" className="in" name="body" rows={compact ? 2 : 3} required maxLength={MAX_MESSAGE} placeholder={me === "team" ? "Message the creator and brand on this deal" : "Write a message"} />
          <div className="spread">
            <span className="hint">{me === "team" ? "Seen by the creator and the brand." : "Seen by the other side and the Colatch team. Phone numbers, emails, handles and UPI ids are hidden."}</span>
            <button className="btn plum">Send message</button>
          </div>
        </form>
      ) : readOnlyNote ? <p className="hint" style={{ margin: "10px 0 0" }}>{readOnlyNote}</p> : null}
    </section>
  );
}
