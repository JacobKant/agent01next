import { ChatMessage } from "@/types/chat";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openai/gpt-oss-20b:free";

const SYSTEM_PROMPT = `Ты универсальный AI помощник.`;

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
  tools?: OpenRouterTool[]
): Promise<{ message: ChatMessage; usage?: TokenUsage }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY не найден. Добавьте ключ в .env.local и перезапустите dev-сервер."
    );
  }

  // Валидируем и очищаем сообщения от некорректных tool-сообщений
  const cleanedMessages = validateAndCleanMessages(messages);

  // Добавляем system prompt в начало массива сообщений
  const messagesWithSystem: ChatMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...cleanedMessages,
  ];

  const requestBody: any = {
    model,
    messages: messagesWithSystem,
    temperature,
    reasoning: { enabled: true },
  };

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

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Agent01 Chat",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter вернул ошибку ${response.status}: ${errorText}`.trim()
    );
  }

  const result = (await response.json()) as OpenRouterResponse;
  
  console.log("OpenRouter Response JSON:", JSON.stringify(result, null, 2));

  const message = result.choices?.[0]?.message;

  if (!message) {
    throw new Error("OpenRouter не вернул сообщение");
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

