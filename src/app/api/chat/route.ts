import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter, TokenUsage } from "@/lib/openrouter";
import { ChatMessage } from "@/types/chat";

type ChatRequestBody = {
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Некорректный JSON в теле запроса" },
      { status: 400 }
    );
  }

  const { messages, model, temperature, max_tokens } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Поле messages обязательно" },
      { status: 400 }
    );
  }

  try {
    const result = await callOpenRouter(
      messages,
      model,
      temperature ?? 1.0,
      max_tokens
    );
    return NextResponse.json(
      { message: result.message, usage: result.usage },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка OpenRouter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

