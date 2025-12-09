import { ChatMessage } from "@/types/chat";

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
  temperature: number = 1.0
): Promise<{ message: ChatMessage; usage?: TokenUsage }> {
  if (!HF_API_KEY) {
    throw new Error(
      "HF_TOKEN не найден. Добавьте ключ в .env.local и перезапустите dev-сервер."
    );
  }

  const requestBody = {
    model,
    messages,
    temperature,
  };

  console.log("HuggingFace Request JSON:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(HF_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json",
    },
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

