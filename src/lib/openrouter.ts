import { ChatMessage } from "@/types/chat";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ??
  "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "x-ai/grok-4.1-fast:free";

const SYSTEM_PROMPT = `Ты - помощник, который ВСЕГДА отвечает в строгом JSON формате без каких-либо дополнительных текстов, комментариев или объяснений.
СТРУКТУРА ОТВЕТА (строго соблюдать):
{
  "answer": "текст ответа на запрос пользователя",
  "promptNiceLevel": число от 0 до 100,
  "suggestions": ["строка1", "строка2", ...],
  "sideThemes": ["строка1", "строка2", ...]
}

ПРАВИЛА:
1. promptNiceLevel - число 0-100, где:
   - 100: полная уверенность, данных достаточно
   - 0: очень примерный ответ, данных мало
2. suggestions - массив строк с предложениями как уточнить запрос
3. sideThemes - массив строк со смежными темами
4. ВСЕ поля обязательны
5. Только JSON, без других текстов
6. Если не понимаешь запрос, promptNiceLevel = 0`;

type OpenRouterChoice = {
  message?: ChatMessage;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
};

export async function callOpenRouter(
  messages: ChatMessage[]
): Promise<ChatMessage> {
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

  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: messagesWithSystem,
    reasoning: { enabled: true },
  };

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

  if (!message?.content) {
    throw new Error("OpenRouter не вернул сообщение ассистента");
  }

  return message;
}

