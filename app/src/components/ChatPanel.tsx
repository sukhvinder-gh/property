"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AssessmentRecord } from "@/types/assessment";

export function ChatPanel({ record }: { record: AssessmentRecord | null }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ record }),
    }),
  });

  return (
    <div className="flex h-full flex-col rounded border">
      <div className="border-b px-3 py-2 text-sm font-semibold">
        {record ? "Ask about this property" : "Ask a planning question"}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block max-w-[85%] rounded px-3 py-2 ${m.role === "user" ? "bg-neutral-800 text-white" : "bg-neutral-100"}`}>
              {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={input}
          placeholder={record ? "Why is my score X?" : "What's a CDC?"}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={status === "streaming"} className="rounded bg-neutral-800 px-3 py-1 text-sm text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
