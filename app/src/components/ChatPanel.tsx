"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AssessmentRecord } from "@/types/assessment";

/** Renders "- " lines as a bullet list and other lines as plain paragraphs. */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: { type: "list" | "text"; lines: string[] }[] = [];
  for (const line of lines) {
    const isBullet = /^\s*[-•]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (isBullet && last?.type === "list") last.lines.push(line.replace(/^\s*[-•]\s+/, ""));
    else if (isBullet) blocks.push({ type: "list", lines: [line.replace(/^\s*[-•]\s+/, "")] });
    else if (line.trim() === "") continue;
    else if (last?.type === "text") last.lines.push(line);
    else blocks.push({ type: "text", lines: [line] });
  }
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "list" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-4">
            {block.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            {block.lines.join(" ")}
          </p>
        ),
      )}
    </>
  );
}

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
              {m.parts.map((part, i) => (part.type === "text" ? <FormattedText key={i} text={part.text} /> : null))}
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
