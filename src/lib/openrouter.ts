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

  // Добавляем system prompt в начало массива сообщений
  const messagesWithSystem: ChatMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...messages,
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

  console.log("OpenRouter Request JSON:", JSON.stringify(requestBody, null, 2));

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

