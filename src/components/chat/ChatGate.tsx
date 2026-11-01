import { useEffect, useState } from "react";
import { ChatWidget } from "./ChatWidget";

// Soft launch and off switch for the chat (Ayesha, 2026-10-28), set by VITE_CHAT_MODE in Vercel
// (a redeploy picks it up; no code change):
//   on       (or unset) -- the chat shows on every page
//   preview  -- hidden, except for someone who opens any page with ?chat=1 (remembered on that
//               browser; ?chat=0 forgets it). For trying it on the live site before customers see it.
//   off      -- never shown
const MODE = (import.meta.env.VITE_CHAT_MODE as string | undefined)?.trim().toLowerCase() || "on";
const KEY = "blr_chat_preview";

export function ChatGate() {
  const [show, setShow] = useState(MODE === "on");

  useEffect(() => {
    if (MODE !== "preview") return;
    const asked = new URLSearchParams(window.location.search).get("chat");
    try {
      if (asked === "1") localStorage.setItem(KEY, "1");
      if (asked === "0") localStorage.removeItem(KEY);
      setShow(localStorage.getItem(KEY) === "1");
    } catch {
      setShow(asked === "1"); // storage blocked: this page only
    }
  }, []);

  return show ? <ChatWidget /> : null;
}
