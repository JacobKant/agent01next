import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/openrouter";
import { ChatMessage } from "@/types/chat";

type ChatRequestBody = {
  messages?: ChatMessage[];
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

  const { messages } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Поле messages обязательно" },
      { status: 400 }
    );
  }

  try {
    const assistantMessage = await callOpenRouter(messages);
    return NextResponse.json({ message: assistantMessage }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка OpenRouter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

