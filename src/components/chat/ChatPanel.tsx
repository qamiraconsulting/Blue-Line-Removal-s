import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import clsx from "clsx";
import { useChatSession } from "./useChatSession";

export function ChatPanel() {
  const { messages, sendMessage, status, error } = useChatSession();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || status === "sending") return;
    setDraft("");
    void sendMessage(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 bg-navy px-4 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-action text-xs font-bold">B</div>
        <div>
          <p className="font-display text-sm font-bold leading-tight">Blue Line Removals</p>
          <p className="text-[11px] leading-tight text-white/70">Usually replies instantly</p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={clsx(
              "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
              m.role === "user" ? "ml-auto bg-action text-white" : "mr-auto bg-white text-navy shadow-sm",
            )}
          >
            {m.content}
          </div>
        ))}
        {status === "sending" && (
          <div className="mr-auto flex max-w-[85%] items-center gap-1 rounded-2xl bg-white px-3.5 py-2.5 shadow-sm">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3" />
          </div>
        )}
        {error && <p className="text-center text-xs text-red-600">{error}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your message..."
          autoComplete="off"
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-action focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim() || status === "sending"}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-navy text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
