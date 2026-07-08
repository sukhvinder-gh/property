import { NextRequest } from "next/server";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt } from "@/lib/chatbot/system-prompt";
import { AssessmentRecordSchema } from "@/types/assessment";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const recordParsed = AssessmentRecordSchema.safeParse(body.record);
  const record = recordParsed.success ? recordParsed.data : null;

  const result = streamText({
    model: anthropic("claude-haiku-4-5"),
    system: buildSystemPrompt(record),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
