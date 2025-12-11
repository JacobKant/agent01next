import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/openrouter";
import { callHuggingFace } from "@/lib/huggingface";
import { ChatMessage } from "@/types/chat";

type ChatRequestBody = {
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  max_new_tokens?: number;
  provider?: "openrouter" | "huggingface";
};

// Функция для суммаризации истории чата
async function summarizeHistory(
  historyMessages: ChatMessage[],
  provider: "openrouter" | "huggingface",
  model?: string,
  temperature?: number
): Promise<ChatMessage> {
  const summaryPrompt: ChatMessage = {
    role: "user",
    content: `Пожалуйста, суммируй следующую историю диалога, сохраняя ключевые моменты и контекст. История:\n\n${historyMessages.map(m => `${m.role}: ${m.content}`).join("\n\n")}`,
  };

  let result;
  if (provider === "huggingface") {
    result = await callHuggingFace(
      [summaryPrompt],
      model!,
      temperature ?? 0.7,
      500 // Ограничиваем токены для суммаризации
    );
  } else {
    result = await callOpenRouter(
      [summaryPrompt],
      model,
      temperature ?? 0.7,
      500 // Ограничиваем токены для суммаризации
    );
  }

  return {
    role: "assistant",
    content: result.message.content,
  };
}

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

  const { messages, model, temperature, max_tokens, max_new_tokens, provider = "openrouter" } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Поле messages обязательно" },
      { status: 400 }
    );
  }

  // Для HuggingFace модель обязательна
  if (provider === "huggingface" && !model) {
    return NextResponse.json(
      { error: "Поле model обязательно для провайдера HuggingFace" },
      { status: 400 }
    );
  }

  try {
    let messagesToSend = messages;
    let summarizedMessage: ChatMessage | null = null;

    // Если сообщений больше 10, делаем суммаризацию
    if (messages.length > 10) {
      // Берем все сообщения кроме последнего (текущий запрос пользователя)
      const historyMessages = messages.slice(0, -1);
      const currentUserMessage = messages[messages.length - 1];

      // Суммаризируем историю
      summarizedMessage = await summarizeHistory(
        historyMessages,
        provider,
        model,
        temperature
      );

      // Заменяем историю на суммаризированное сообщение + текущий запрос
      messagesToSend = [summarizedMessage, currentUserMessage];
    }

    let result;
    
    if (provider === "huggingface") {
      result = await callHuggingFace(
        messagesToSend,
        model!,
        temperature ?? 1.0,
        max_new_tokens
      );
    } else {
      result = await callOpenRouter(
        messagesToSend,
        model,
        temperature ?? 1.0,
        max_tokens
      );
    }
    
    return NextResponse.json(
      { 
        message: result.message, 
        usage: result.usage,
        summarized: summarizedMessage ? {
          message: summarizedMessage,
          originalCount: messages.length - 1
        } : undefined
      },
      { status: 200 }
    );
  } catch (error) {
    const providerName = provider === "huggingface" ? "HuggingFace" : "OpenRouter";
    const message =
      error instanceof Error ? error.message : `Неизвестная ошибка ${providerName}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

