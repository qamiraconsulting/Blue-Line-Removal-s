import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { RotateCcw, Send } from "lucide-react";
import clsx from "clsx";
import { site } from "@/data/site";
import { splitChoices } from "@/lib/chatChoices";
import { useChatSession } from "./useChatSession";

export function ChatPanel() {
  const { messages, sendMessage, retry, startNewChat, status, error, awaitingTeam } = useChatSession();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busy = status === "sending" || status === "starting";
  const hasCustomerMessage = messages.some((m) => m.role === "user");
  // Tap-to-reply buttons: only for the newest message, and only when it's the assistant's.
  const last = messages[messages.length - 1];
  const choices = last && last.role === "assistant" && !last.failed ? splitChoices(last.content).choices : [];

  useEffect(() => {
    // Jump straight to the newest message (smooth scrolling can stall mid-animation on re-render).
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, status]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 bg-navy px-4 py-3 text-white">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-action text-xs font-bold">B</div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold leading-tight">Blue Line Removals</p>
          <p className="text-[11px] leading-tight text-white/70">
            {awaitingTeam ? "A team member will reply here" : "Instant estimates, any time"}
          </p>
        </div>
        {status !== "unavailable" && hasCustomerMessage && (
          <button
            type="button"
            onClick={startNewChat}
            disabled={busy}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            New chat
          </button>
        )}
      </div>

      {status === "unavailable" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
          <p className="text-sm text-navy">Our chat assistant isn&apos;t available just now.</p>
          <a href={site.phone.href} className="rounded-full bg-action px-5 py-2 text-sm font-bold text-white hover:bg-action-bright">
            Call {site.phone.display}
          </a>
          <Link to="/quote" className="text-sm font-bold text-navy underline">
            Or get a quote online
          </Link>
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={clsx("max-w-[85%]", m.role === "user" ? "ml-auto" : "mr-auto")}>
                {m.role === "team" && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-action">Blue Line team</p>}
                <div
                  className={clsx(
                    "whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user" && "bg-action text-white",
                    m.role === "assistant" && "bg-white text-navy shadow-sm",
                    m.role === "team" && "border border-action/30 bg-white text-navy shadow-sm",
                    m.failed && "opacity-60",
                  )}
                >
                  <LinkedText text={splitChoices(m.content).text} />
                </div>
                {m.failed && (
                  <button type="button" onClick={() => void retry(m)} disabled={busy} className="mt-1 block w-full text-right text-xs font-bold text-red-600 underline">
                    Not sent -- tap to retry
                  </button>
                )}
              </div>
            ))}

            {choices.length > 0 && status === "idle" && !awaitingTeam && (
              <div className="flex flex-wrap gap-2 pt-1">
                {choices.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    className="rounded-full border border-navy/20 bg-white px-3 py-1.5 text-xs font-bold text-navy hover:border-action hover:text-action"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="mr-auto flex max-w-[85%] items-center gap-1 rounded-2xl bg-white px-3.5 py-2.5 shadow-sm" aria-label="Typing">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-3" />
              </div>
            )}
            {error && <p className="text-center text-xs text-red-600">{error}</p>}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white px-3 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={status === "starting" ? "Connecting..." : "Type your message..."}
                autoComplete="off"
                maxLength={2000}
                aria-label="Your message"
                className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-action focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!draft.trim() || busy}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-navy text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] leading-snug text-slate-400">
              We keep this chat to help with your move. Please don&apos;t share payment details.
            </p>
          </form>
        </>
      )}
    </div>
  );
}

// Secure links in a message (e.g. the deposit payment link) open in a new tab. https only.
function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-bold underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
