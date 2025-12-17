import { NextRequest, NextResponse } from "next/server";
import { TokenUsage } from "@/lib/openrouter";
import { callHuggingFace } from "@/lib/huggingface";
import { ChatMessage } from "@/types/chat";
import { executeChatWithMCP } from "@/lib/chat-executor";

type ChatRequestBody = {
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  max_new_tokens?: number;
  provider?: "openrouter" | "huggingface";
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

    let result: { message: ChatMessage; usage?: TokenUsage } | undefined;
    let executedTools: Array<{
      id: string;
      name: string;
      arguments: unknown;
      result: string;
    }> = [];
    let intermediateMessages: ChatMessage[] = [];

    if (provider === "huggingface") {
      // HuggingFace пока не поддерживает tools в текущей реализации
      result = await callHuggingFace(
        messagesToSend,
        model!,
        temperature ?? 1.0,
        max_new_tokens
      );
    } else {
      // OpenRouter с поддержкой MCP инструментов через общую функцию
      const executionResult = await executeChatWithMCP(
        messagesToSend,
        model,
        temperature ?? 1.0,
        max_tokens
      );
      
      result = {
        message: executionResult.message,
        usage: executionResult.usage,
      };
      executedTools = executionResult.executedTools || [];
      intermediateMessages = executionResult.intermediateMessages || [];
    }

    // Проверяем, что result определен
    if (!result) {
      throw new Error("Не получен результат от LLM");
    }

    // Форматируем финальное сообщение
    let finalMessage = result.message;
    if (typeof finalMessage.content !== "string") {
      // Если content это массив, извлекаем текстовую часть
      if (Array.isArray(finalMessage.content)) {
        const textParts = finalMessage.content
          .filter((item: any) => item.type === "text")
          .map((item: any) => item.text || "")
          .join("");
        finalMessage = {
          ...finalMessage,
          content: textParts || "",
        };
      } else if (finalMessage.content === null) {
        // Если content null, заменяем на пустую строку
        finalMessage = {
          ...finalMessage,
          content: "",
        };
      }
    }
    
    return NextResponse.json(
      {
        message: finalMessage,
        usage: result.usage,
        summarized: summarizedMessage
          ? {
              message: summarizedMessage,
              originalCount: messages.length - 1,
            }
          : undefined,
        tools:
          executedTools.length > 0
            ? executedTools
            : undefined,
        // Возвращаем все промежуточные сообщения (assistant с tool_calls и tool results)
        intermediateMessages: intermediateMessages.length > 0 ? intermediateMessages : undefined,
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

