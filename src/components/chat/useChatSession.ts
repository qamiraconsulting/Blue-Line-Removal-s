import { useCallback, useEffect, useState } from "react";

// No customer login -- an anonymous conversation_id lives in localStorage,
// surviving a page refresh on the same device/browser (per the roadmap's
// session-continuity decision). A different device starts fresh; once the
// bot has the customer's phone/email, that's enough to look up an existing
// lead if they come back, without a password system.
const STORAGE_KEY = "blr_chat_conversation_id";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type Status = "idle" | "sending" | "error";

export function useChatSession() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) {
      setConversationId(existing);
      void resumeSession(existing);
    } else {
      void startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSession() {
    try {
      const res = await fetch("/api/chat/session", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start chat session");
      const data = await res.json();
      localStorage.setItem(STORAGE_KEY, data.conversationId);
      setConversationId(data.conversationId);
      if (data.greeting) {
        setMessages([{ id: "greeting", role: "assistant", content: data.greeting }]);
      }
    } catch (err) {
      console.error(err);
      setError("Couldn't start the chat just now -- try refreshing the page.");
    }
  }

  async function resumeSession(id: string) {
    try {
      const res = await fetch(`/api/chat/session/${id}`);
      if (!res.ok) {
        // Session expired or not found server-side -- start a fresh one
        // rather than getting stuck.
        localStorage.removeItem(STORAGE_KEY);
        await startSession();
        return;
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (err) {
      console.error(err);
      setError("Couldn't resume your chat -- try refreshing the page.");
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId) return;
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
      setStatus("sending");
      setError(null);

      try {
        const res = await fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: text }),
        });
        if (!res.ok) throw new Error("Message failed");
        const data = await res.json();
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply }]);
        setStatus("idle");
      } catch (err) {
        console.error(err);
        setStatus("error");
        setError("That message didn't send -- please try again.");
      }
    },
    [conversationId],
  );

  return { messages, sendMessage, status, error };
}
