import { ChatMessage } from "@/types/chat";
import { getSystemPrompt, AssistantRole } from "./system-prompts";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "mistralai/devstral-2512:free";

type OpenRouterChoice = {
  message?: ChatMessage;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

/**
 * Валидирует и очищает массив сообщений от некорректных tool-сообщений
 * Tool-сообщения должны идти сразу после assistant-сообщения с tool_calls
 * и иметь соответствующий tool_call_id
 */
function validateAndCleanMessages(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];
  const pendingToolCallIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      // Assistant с tool_calls - добавляем и запоминаем ID вызовов
      cleaned.push(msg);
      msg.tool_calls.forEach(tc => pendingToolCallIds.add(tc.id));
    } else if (msg.role === "tool") {
      // Tool-сообщение - проверяем, что оно идет после соответствующего assistant
      // tool_call_id должен быть (он всегда есть, но проверяем порядок)
      if (msg.tool_call_id && pendingToolCallIds.has(msg.tool_call_id)) {
        // Валидное tool-сообщение - добавляем
        cleaned.push(msg);
        pendingToolCallIds.delete(msg.tool_call_id);
      } else {
        // Tool-сообщение идет не после соответствующего assistant - пропускаем
        console.warn(
          `[OpenRouter] Пропущено tool-сообщение с tool_call_id "${msg.tool_call_id}" на позиции ${i} - нет соответствующего assistant с tool_calls`
        );
      }
    } else {
      // Обычное сообщение (user, system, assistant без tool_calls)
      // Очищаем pending tool_call_ids при переходе к новому диалогу
      if (msg.role === "user") {
        pendingToolCallIds.clear();
      }
      cleaned.push(msg);
    }
  }

  return cleaned;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  model: string = OPENROUTER_MODEL,
  temperature: number = 1.0,
  max_tokens?: number,
  tools?: OpenRouterTool[],
  assistantRole?: AssistantRole,
  baseUrl?: string,
  customSystemPrompt?: string
): Promise<{ message: ChatMessage; usage?: TokenUsage }> {
  // Для кастомного API ключ может не требоваться
  if (!baseUrl && !OPENROUTER_API_KEY) {
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const errorMessage = isCI
      ? "OPENROUTER_API_KEY не найден в переменных окружения GitHub Actions. Добавьте секрет OPENROUTER_API_KEY в настройках репозитория: Settings → Secrets and variables → Actions → New repository secret"
      : "OPENROUTER_API_KEY не найден. Добавьте ключ в .env.local и перезапустите dev-сервер.";
    throw new Error(errorMessage);
  }

  // Валидируем и очищаем сообщения от некорректных tool-сообщений
  const cleanedMessages = validateAndCleanMessages(messages);

  // Проверяем, есть ли уже системное сообщение в начале массива
  const hasSystemMessage = cleanedMessages.length > 0 && cleanedMessages[0].role === "system";

  // Получаем системный промпт для указанной роли (с поддержкой кастомного промпта)
  const systemPrompt = getSystemPrompt(assistantRole || "default", customSystemPrompt);

  // Добавляем system prompt только если его еще нет
  const messagesWithSystem: ChatMessage[] = hasSystemMessage
    ? cleanedMessages
    : [
        {
          role: "system",
          content: systemPrompt,
        },
        ...cleanedMessages,
      ];

  const requestBody: any = {
    model,
    messages: messagesWithSystem,
    temperature,
  };

  // Параметр reasoning поддерживается только OpenRouter, не добавляем для кастомного API
  if (!baseUrl) {
    requestBody.reasoning = { enabled: true };
  } else {
    // Для кастомного API (Ollama) отключаем streaming для получения полного ответа
    requestBody.stream = false;
  }

  if (max_tokens !== undefined) {
    requestBody.max_tokens = max_tokens;
  }

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  // Компактное логирование инструментов
  const logBody: any = {
    model: requestBody.model,
    messages: requestBody.messages.map((msg: ChatMessage) => ({
      role: msg.role,
      content: typeof msg.content === "string" 
        ? (msg.content.length > 100 ? msg.content.substring(0, 100) + "..." : msg.content)
        : msg.content,
      tool_calls: msg.tool_calls ? `${msg.tool_calls.length} call(s)` : undefined,
      tool_call_id: msg.tool_call_id,
    })),
    temperature: requestBody.temperature,
    ...(requestBody.max_tokens ? { max_tokens: requestBody.max_tokens } : {}),
    ...(requestBody.tools && tools ? { 
      tools: `[${tools.length} инструментов: ${tools.map(t => t.function.name).join(", ")}]` 
    } : {}),
  };
  
  console.log("OpenRouter Request:", JSON.stringify(logBody, null, 2));

  // Используем кастомный baseUrl если передан, иначе дефолтный
  const apiBaseUrl = baseUrl || OPENROUTER_BASE_URL;
  
  // Для кастомного API ключ может не требоваться
  const apiKey = baseUrl ? (process.env.CUSTOM_API_KEY || OPENROUTER_API_KEY) : OPENROUTER_API_KEY;

  // Формируем заголовки
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Добавляем Authorization только если есть ключ
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  // Для OpenRouter добавляем дополнительные заголовки
  if (!baseUrl) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME ?? "Agent01 Chat";
  }

  const response = await fetch(apiBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter вернул ошибку ${response.status}: ${errorText}`.trim()
    );
  }

  // Получаем текст ответа для обработки потоковых и нестандартных форматов
  const responseText = await response.text();
  
  // Логируем первые 500 символов ответа для отладки
  console.log("API Response (first 500 chars):", responseText.substring(0, 500));
  
  let result: OpenRouterResponse;
  
  try {
    // Пытаемся распарсить как один JSON объект
    result = JSON.parse(responseText) as OpenRouterResponse;
  } catch (parseError) {
    // Если не получилось, возможно это потоковый ответ (несколько JSON объектов)
    // Ollama может возвращать несколько JSON объектов, разделенных переносами строк
    const lines = responseText.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error(`Пустой ответ от API: ${responseText}`);
    }
    
    // Если это потоковый ответ Ollama, собираем все части content
    const ollamaStreamChunks: Array<{ message?: { content?: string }; done?: boolean }> = [];
    let lastValidJson: OpenRouterResponse | null = null;
    let parseErrors: string[] = [];
    
    // Парсим все строки и собираем части сообщения
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]) as any;
        
        // Проверяем, это формат Ollama (с полем message и model)
        if (parsed.model && parsed.message) {
          ollamaStreamChunks.push(parsed);
          // Если это финальный чанк с done: true, сохраняем его как последний
          if (parsed.done === true) {
            lastValidJson = parsed as OpenRouterResponse;
          }
        } else if (parsed.choices || parsed.message || parsed.model) {
          // Другой формат ответа
          lastValidJson = parsed as OpenRouterResponse;
        }
      } catch (e) {
        parseErrors.push(`Строка ${i}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    
    // Если нашли потоковые чанки Ollama, собираем полное сообщение
    if (ollamaStreamChunks.length > 0) {
      // Собираем все части content из всех чанков
      const fullContent = ollamaStreamChunks
        .map(chunk => chunk.message?.content || '')
        .join('');
      
      // Используем последний чанк как основу, но заменяем content на собранный
      const baseChunk = lastValidJson || ollamaStreamChunks[ollamaStreamChunks.length - 1];
      result = {
        ...baseChunk,
        message: {
          ...(baseChunk as any).message,
          content: fullContent,
        },
      } as OpenRouterResponse;
    } else if (!lastValidJson) {
      // Если не нашли валидный JSON, пробуем объединить все строки
      try {
        // Удаляем лишние символы и пробуем распарсить как один объект
        const cleaned = responseText.trim().replace(/\}\s*\{/g, '}\n{');
        const firstJsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (firstJsonMatch) {
          result = JSON.parse(firstJsonMatch[0]) as OpenRouterResponse;
        } else {
          throw new Error(`Не удалось распарсить ответ. Ошибки: ${parseErrors.join('; ')}. Ответ: ${responseText.substring(0, 500)}`);
        }
      } catch (finalError) {
        throw new Error(`Не удалось распарсить ответ от API. Ошибки: ${parseErrors.join('; ')}. Первые 500 символов ответа: ${responseText.substring(0, 500)}`);
      }
    } else {
      result = lastValidJson;
    }
  }
  
  console.log("OpenRouter Response JSON:", JSON.stringify(result, null, 2));

  // Ollama может возвращать ответ в другом формате, проверяем оба варианта
  let message: ChatMessage | undefined;
  
  if (result.choices?.[0]?.message) {
    // Стандартный формат OpenRouter
    message = result.choices[0].message;
  } else if ((result as any).message) {
    // Формат Ollama (прямое поле message)
    const ollamaMessage = (result as any).message;
    // Ollama возвращает message как объект с role и content
    if (typeof ollamaMessage === 'object' && ollamaMessage.content !== undefined) {
      message = {
        role: ollamaMessage.role || "assistant",
        content: ollamaMessage.content,
        tool_calls: ollamaMessage.tool_calls,
      };
    } else {
      // Если message это просто строка
      message = {
        role: "assistant",
        content: typeof ollamaMessage === 'string' ? ollamaMessage : String(ollamaMessage),
      };
    }
  } else if ((result as any).response) {
    // Альтернативный формат Ollama
    message = {
      role: "assistant",
      content: (result as any).response,
    };
  }

  if (!message) {
    throw new Error(`API не вернул сообщение. Структура ответа: ${JSON.stringify(result, null, 2).substring(0, 500)}`);
  }

  const usage: TokenUsage | undefined = result.usage
    ? {
        prompt_tokens: result.usage.prompt_tokens ?? 0,
        completion_tokens: result.usage.completion_tokens ?? 0,
        total_tokens: result.usage.total_tokens ?? 0,
      }
    : undefined;

  return { message, usage };
}

