import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// No customer login -- an anonymous conversation id lives in localStorage, surviving a page
// refresh on the same device/browser. Chats older than MAX_AGE_DAYS start fresh. A
// different device starts fresh too; once the bot has the customer's phone/email, the team
// can find them without a password system.
const STORAGE_KEY = "blr_chat_conversation_id";
const STARTED_KEY = "blr_chat_started_at";
const MAX_AGE_DAYS = 14;
// While a team member is (or is about to be) handling the chat, check for their reply.
const POLL_MS = 8000;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "team";
  content: string;
  /** A customer message that didn't reach the server -- shown with a retry button. */
  failed?: boolean;
}

type Status = "starting" | "idle" | "sending" | "unavailable";

// localStorage can throw (private mode, blocked storage) -- the chat must still work.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // not remembered across reloads; fine
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STARTED_KEY);
    } catch {
      // ignore
    }
  },
};

const errorText = async (res: Response, fallback: string) => {
  try {
    return ((await res.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
};

export function useChatSession() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [awaitingTeam, setAwaitingTeam] = useState(false);
  const sendingRef = useRef(false);

  const startSession = useCallback(async () => {
    setStatus("starting");
    setError(null);
    setAwaitingTeam(false);
    try {
      const res = await fetch("/api/chat/session", { method: "POST" });
      if (res.status === 503) {
        setStatus("unavailable");
        return;
      }
      if (!res.ok) throw new Error(await errorText(res, "Couldn't start the chat just now."));
      const data = (await res.json()) as { conversationId: string; greeting?: string };
      store.set(STORAGE_KEY, data.conversationId);
      store.set(STARTED_KEY, String(Date.now()));
      setConversationId(data.conversationId);
      setMessages(data.greeting ? [{ id: "greeting", role: "assistant", content: data.greeting }] : []);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the chat just now.");
      setStatus("idle");
    }
  }, []);

  // Load the server's copy of the chat (resume, and polling for team replies).
  const refresh = useCallback(
    async (id: string, opts: { startFreshIfMissing: boolean }) => {
      const res = await fetch(`/api/chat/session/${id}`);
      if (res.status === 503) {
        setStatus("unavailable");
        return;
      }
      if (res.status === 404 || res.status === 400) {
        if (opts.startFreshIfMissing) {
          store.clear();
          await startSession();
        }
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[]; awaitingTeam: boolean };
      // Never overwrite a message the customer is sending right now.
      if (!sendingRef.current) {
        setMessages((prev) => [...data.messages, ...prev.filter((m) => m.failed)]);
      }
      setAwaitingTeam(data.awaitingTeam);
    },
    [startSession],
  );

  useEffect(() => {
    const existing = store.get(STORAGE_KEY);
    const startedAt = Number(store.get(STARTED_KEY) ?? 0);
    const stale = !startedAt || Date.now() - startedAt > MAX_AGE_DAYS * 86_400_000;
    if (existing && !stale) {
      setConversationId(existing);
      void refresh(existing, { startFreshIfMissing: true })
        .then(() => setStatus((s) => (s === "starting" ? "idle" : s)))
        .catch(() => {
          setError("Couldn't load your chat -- try refreshing the page.");
          setStatus("idle");
        });
    } else {
      store.clear();
      void startSession();
    }
  }, [refresh, startSession]);

  // Poll for a team member's reply while one is expected.
  useEffect(() => {
    if (!conversationId || !awaitingTeam) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(conversationId, { startFreshIfMissing: false }).catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, awaitingTeam, refresh]);

  const deliver = useCallback(
    async (id: string, text: string) => {
      if (!conversationId || sendingRef.current) return;
      sendingRef.current = true;
      setStatus("sending");
      setError(null);
      setMessages((prev) => [...prev.filter((m) => m.id !== id), { id, role: "user", content: text }]);

      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: text }),
        });
        if (res.status === 503) {
          setStatus("unavailable");
          return;
        }
        if (res.status === 404) {
          // The chat expired server-side: start a new one and tell the customer.
          store.clear();
          sendingRef.current = false;
          await startSession();
          setError("That chat had expired, so we've started a new one -- please send your message again.");
          return;
        }
        if (!res.ok) throw new Error(await errorText(res, "That message didn't send -- please try again."));

        const data = (await res.json()) as {
          reply: string | null;
          awaitingTeam: boolean;
          outcome: "estimate" | "personal_quote" | "handoff" | null;
        };
        if (data.reply) setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply! }]);
        setAwaitingTeam(data.awaitingTeam);
        if (data.outcome === "estimate") trackEvent("chat_estimate_shown");
        if (data.outcome === "personal_quote" || data.outcome === "handoff") trackEvent("chat_handoff", { handoff_type: data.outcome });
        setStatus("idle");
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, failed: true } : m)));
        setError(err instanceof Error ? err.message : "That message didn't send -- please try again.");
        setStatus("idle");
      } finally {
        sendingRef.current = false;
      }
    },
    [conversationId, startSession],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!messages.some((m) => m.role === "user")) trackEvent("chat_started");
      return deliver(crypto.randomUUID(), text);
    },
    [deliver, messages],
  );

  const retry = useCallback((message: ChatMessage) => deliver(message.id, message.content), [deliver]);

  const startNewChat = useCallback(() => {
    store.clear();
    setConversationId(null);
    setMessages([]);
    void startSession();
  }, [startSession]);

  return { messages, sendMessage, retry, startNewChat, status, error, awaitingTeam };
}
