import { callOpenRouter, TokenUsage } from "./openrouter";
import { ChatMessage } from "@/types/chat";
import { McpClientManager } from "./mcp-client";

export type ChatExecutionResult = {
  message: ChatMessage;
  usage?: TokenUsage;
  executedTools?: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: string;
  }>;
  intermediateMessages?: ChatMessage[];
};

/**
 * Выполняет запрос к LLM с поддержкой MCP инструментов
 * @param messages - Массив сообщений для отправки
 * @param model - Модель для использования (по умолчанию OpenRouter модель)
 * @param temperature - Температура для генерации
 * @param max_tokens - Максимальное количество токенов
 * @returns Результат выполнения с финальным сообщением и метаданными
 */
export async function executeChatWithMCP(
  messages: ChatMessage[],
  model?: string,
  temperature: number = 1.0,
  max_tokens?: number
): Promise<ChatExecutionResult> {
  let messagesToSend = messages;
  const conversationMessages: ChatMessage[] = [...messagesToSend];
  let totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
  const maxIterations = 10; // Защита от бесконечного цикла
  let iterations = 0;
  const executedTools: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: string;
  }> = [];
  const intermediateMessages: ChatMessage[] = [];

  // Инициализируем MCP-клиент и получаем доступные тулы
  const mcpClient = new McpClientManager();
  let tools: any[] = [];
  
  try {
    tools = await mcpClient.connect();
  } catch (error) {
    console.error("[chat-executor] Ошибка при подключении к MCP:", error);
    // Продолжаем без тулов, если MCP недоступен
  }

  let result: { message: ChatMessage; usage?: TokenUsage } | undefined;

  try {
    while (iterations < maxIterations) {
      iterations++;

      // OpenRouter с поддержкой tools
      result = await callOpenRouter(
        conversationMessages,
        model,
        temperature,
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
      console.log(`[chat-executor] Обнаружено ${toolCalls.length} tool call(s)`);

      // Добавляем ответ ассистента с tool calls в историю
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent && assistantContent.trim() ? assistantContent : (null as any),
        tool_calls: toolCalls,
      };
      
      conversationMessages.push(assistantMsg);
      intermediateMessages.push(assistantMsg);

      // Выполняем каждый tool call
      for (const toolCall of toolCalls) {
        try {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          const toolResult = await mcpClient.callTool(toolName, toolArgs);

          // Логируем успешный вызов тула
          executedTools.push({
            id: toolCall.id,
            name: toolName,
            arguments: toolArgs,
            result:
              typeof toolResult === "string"
                ? toolResult.slice(0, 1000)
                : JSON.stringify(toolResult).slice(0, 1000),
          });

          // Добавляем результат тула в формате OpenRouter
          const toolResultMsg: ChatMessage = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          } as ChatMessage;
          conversationMessages.push(toolResultMsg);
          intermediateMessages.push(toolResultMsg);
        } catch (error) {
          console.error(
            `[chat-executor] Ошибка при вызове тула ${toolCall.function.name}:`,
            error
          );

          const errorText =
            error instanceof Error ? error.message : String(error);

          executedTools.push({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: undefined,
            result: `Ошибка: ${errorText}`,
          });

          const toolErrorMsg: ChatMessage = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Ошибка: ${errorText}`,
          } as ChatMessage;
          conversationMessages.push(toolErrorMsg);
          intermediateMessages.push(toolErrorMsg);
        }
      }
    }

    // Проверяем, что result определен
    if (!result) {
      throw new Error("Не получен результат от LLM");
    }

    // Форматируем финальное сообщение
    let finalMessage = result.message;
    if (typeof finalMessage.content !== "string") {
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
        finalMessage = {
          ...finalMessage,
          content: "",
        };
      }
    }

    return {
      message: finalMessage,
      usage: totalUsage || result.usage,
      executedTools: executedTools.length > 0 ? executedTools : undefined,
      intermediateMessages: intermediateMessages.length > 0 ? intermediateMessages : undefined,
    };
  } finally {
    // Закрываем MCP-клиент
    try {
      await mcpClient.close();
    } catch (error) {
      console.error("[chat-executor] Ошибка при закрытии MCP-клиента:", error);
    }
  }
}

