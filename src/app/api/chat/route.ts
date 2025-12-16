import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter, TokenUsage } from "@/lib/openrouter";
import { callHuggingFace } from "@/lib/huggingface";
import { ChatMessage } from "@/types/chat";
import { McpClientManager } from "@/lib/mcp-client";

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

    // Инициализируем MCP-клиент и получаем доступные тулы
    const mcpClient = new McpClientManager();
    let tools: any[] = [];
    
    try {
      tools = await mcpClient.connect();
    } catch (error) {
      console.error("[chat route] Ошибка при подключении к MCP:", error);
      // Продолжаем без тулов, если MCP недоступен
    }

    // Обрабатываем запрос с поддержкой tool calls
    let result: { message: ChatMessage; usage?: TokenUsage } | undefined;
    const conversationMessages: ChatMessage[] = [...messagesToSend];
    let totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    const maxIterations = 10; // Защита от бесконечного цикла
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      if (provider === "huggingface") {
        // HuggingFace пока не поддерживает tools в текущей реализации
        result = await callHuggingFace(
          conversationMessages,
          model!,
          temperature ?? 1.0,
          max_new_tokens
        );
        break; // HuggingFace не поддерживает tool calls, выходим
      } else {
        // OpenRouter с поддержкой tools
        result = await callOpenRouter(
          conversationMessages,
          model,
          temperature ?? 1.0,
          max_tokens,
          tools.length > 0 ? tools : undefined
        );

        // Обновляем общее использование токенов
        if (result.usage) {
          if (!totalUsage) {
            totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          }
          totalUsage.prompt_tokens += result.usage.prompt_tokens;
          totalUsage.completion_tokens += result.usage.completion_tokens;
          totalUsage.total_tokens += result.usage.total_tokens;
        }

        // Проверяем, есть ли tool calls в ответе
        const message = result.message;
        const toolCalls = message.tool_calls;

        // Если content это массив, извлекаем текстовую часть
        let assistantContent: string = "";
        if (typeof message.content === "string") {
          assistantContent = message.content;
        } else if (Array.isArray(message.content)) {
          const textParts = message.content
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text || "")
            .join("");
          assistantContent = textParts;
        }

        if (!toolCalls || toolCalls.length === 0) {
          // Нет tool calls, возвращаем финальный ответ
          break;
        }

        // Есть tool calls, выполняем их через MCP
        console.log(`[chat route] Обнаружено ${toolCalls.length} tool call(s)`);

        // Добавляем ответ ассистента с tool calls в историю
        // Формат для OpenRouter: content может быть null или пустым при наличии tool_calls
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: assistantContent && assistantContent.trim() ? assistantContent : (null as any),
          tool_calls: toolCalls,
        };
        
        conversationMessages.push(assistantMsg);

        // Выполняем каждый tool call
        // Согласно документации OpenRouter: https://openrouter.ai/docs/guides/features/tool-calling
        // Формат должен быть: { "role": "tool", "tool_call_id": "...", "content": "..." }
        for (const toolCall of toolCalls) {
          try {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            const toolResult = await mcpClient.callTool(toolName, toolArgs);

            // Добавляем результат тула в формате OpenRouter
            conversationMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            } as ChatMessage);
          } catch (error) {
            console.error(`[chat route] Ошибка при вызове тула ${toolCall.function.name}:`, error);
            // Добавляем сообщение об ошибке
            conversationMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
            } as ChatMessage);
          }
        }

        // Продолжаем цикл, чтобы LLM обработал результаты тулов
      }
    }

    // Закрываем MCP-клиент
    try {
      await mcpClient.close();
    } catch (error) {
      console.error("[chat route] Ошибка при закрытии MCP-клиента:", error);
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
        usage: totalUsage || result.usage,
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

