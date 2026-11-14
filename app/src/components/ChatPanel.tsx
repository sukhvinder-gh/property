"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AssessmentRecord } from "@/types/assessment";

/** Splits "**bold**" spans out of a line of text for inline rendering. */
function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

/** Renders "- " lines as a bullet list, "#" lines as headings, "---" as a rule, everything else as paragraphs, with "**bold**" spans inline throughout. Defensive against the model reaching for markdown despite the system prompt discouraging it. */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: { type: "list" | "text" | "heading" | "rule"; lines: string[] }[] = [];
  for (const line of lines) {
    const isBullet = /^\s*[-•]\s+/.test(line);
    const isHeading = /^#{1,6}\s+/.test(line);
    const isRule = /^\s*(-{3,}|\*{3,})\s*$/.test(line);
    const last = blocks[blocks.length - 1];
    if (isRule) {
      blocks.push({ type: "rule", lines: [] });
    } else if (isHeading) {
      blocks.push({ type: "heading", lines: [line.replace(/^#{1,6}\s+/, "")] });
    } else if (isBullet && last?.type === "list") {
      last.lines.push(line.replace(/^\s*[-•]\s+/, ""));
    } else if (isBullet) {
      blocks.push({ type: "list", lines: [line.replace(/^\s*[-•]\s+/, "")] });
    } else if (line.trim() === "") {
      continue;
    } else if (last?.type === "text") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "text", lines: [line] });
    }
  }
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "rule") return <hr key={i} className="my-2 border-t border-neutral-300" />;
        if (block.type === "heading")
          return (
            <p key={i} className={`font-semibold ${i > 0 ? "mt-2" : ""}`}>
              {renderInline(block.lines[0])}
            </p>
          );
        if (block.type === "list")
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {block.lines.map((l, j) => (
                <li key={j}>{renderInline(l)}</li>
              ))}
            </ul>
          );
        return (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            {renderInline(block.lines.join(" "))}
          </p>
        );
      })}
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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-brand-900 px-4 py-3 text-sm font-semibold text-white">
        {record ? "Ask about this property" : "Ask a planning question"}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && (
          <p className="text-slate-500">
            {record
              ? "Ask anything about this report — why the score is what it is, what a control means, or what to do next."
              : "Ask a general NSW planning question — CDC vs DA, granny flat rules, setbacks and more."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 ${m.role === "user" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.parts.map((part, i) => (part.type === "text" ? <FormattedText key={i} text={part.text} /> : null))}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          value={input}
          placeholder={record ? "Why is my score X?" : "What's a CDC?"}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={status === "streaming"} className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
