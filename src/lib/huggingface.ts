import { ChatMessage } from "@/types/chat";
import { getSystemPrompt, AssistantRole } from "./system-prompts";

const HF_API_KEY = process.env.HF_TOKEN;
const HF_BASE_URL = "https://router.huggingface.co/v1/chat/completions";

type HuggingFaceChoice = {
  message?: ChatMessage;
};

type HuggingFaceUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type HuggingFaceResponse = {
  choices?: HuggingFaceChoice[];
  usage?: HuggingFaceUsage;
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export async function callHuggingFace(
  messages: ChatMessage[],
  model: string,
  temperature: number = 1.0,
  max_new_tokens?: number,
  baseUrl?: string,
  assistantRole?: AssistantRole,
  customSystemPrompt?: string
): Promise<{ message: ChatMessage; usage?: TokenUsage }> {
  // Для кастомного API ключ может не требоваться
  if (!baseUrl && !HF_API_KEY) {
    throw new Error(
      "HF_TOKEN не найден. Добавьте ключ в .env.local и перезапустите dev-сервер."
    );
  }

  // Проверяем, есть ли уже системное сообщение в начале массива
  const hasSystemMessage = messages.length > 0 && messages[0].role === "system";

  // Получаем системный промпт для указанной роли (с поддержкой кастомного промпта)
  const systemPrompt = getSystemPrompt(assistantRole || "default", customSystemPrompt);

  // Всегда подставляем актуальный system prompt под текущую роль
  const messagesWithSystem: ChatMessage[] = hasSystemMessage
    ? [{ role: "system", content: systemPrompt }, ...messages.slice(1)]
    : [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

  const requestBody: any = {
    model,
    messages: messagesWithSystem,
    temperature,
  };

  if (max_new_tokens !== undefined) {
    requestBody.max_new_tokens = max_new_tokens;
  }

  console.log("HuggingFace Request JSON:", JSON.stringify(requestBody, null, 2));

  // Используем кастомный baseUrl если передан, иначе дефолтный
  const apiBaseUrl = baseUrl || HF_BASE_URL;
  const apiKey = baseUrl ? (process.env.CUSTOM_API_KEY || HF_API_KEY) : HF_API_KEY;

  // Формируем заголовки
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Добавляем Authorization только если есть ключ
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(apiBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HuggingFace вернул ошибку ${response.status}: ${errorText}`.trim()
    );
  }

  const result = (await response.json()) as HuggingFaceResponse;
  
  console.log("HuggingFace Response JSON:", JSON.stringify(result, null, 2));

  const message = result.choices?.[0]?.message;

  if (!message?.content) {
    throw new Error("HuggingFace не вернул сообщение ассистента");
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

