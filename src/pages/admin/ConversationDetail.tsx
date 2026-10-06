import { useEffect, useState } from "react";
import { useParams } from "react-router";
import clsx from "clsx";
import { useAdminApi } from "./useAdminApi";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Lead {
  customerName: string | null;
  phone: string | null;
  email: string | null;
}

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const { adminFetch } = useAdminApi();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminFetch(`/api/admin/conversation/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => {
        setMessages(data.messages);
        setLead(data.lead);
      })
      .catch((err) => setError(err.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/reply", {
        method: "POST",
        body: JSON.stringify({ conversationId: id, message: text }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to send");
      setReply("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {lead && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <p className="font-display font-bold text-navy">{lead.customerName ?? "Unnamed enquiry"}</p>
          <p className="text-sm text-slate-600">
            {lead.phone} &middot; {lead.email}
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
        {messages?.map((m) => (
          <div
            key={m.id}
            className={clsx(
              "max-w-[80%] whitespace-pre-line rounded-xl px-3.5 py-2 text-sm",
              m.role === "user" && "ml-0 bg-slate-100 text-navy",
              m.role === "assistant" && "ml-0 bg-blue-50 text-navy",
              m.role === "human_agent" && "ml-auto bg-action text-white",
            )}
          >
            <p className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">
              {m.role === "human_agent" ? "You" : m.role}
            </p>
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply to this customer..."
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-action focus:outline-none"
        />
        <button
          type="submit"
          disabled={!reply.trim() || sending}
          className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
