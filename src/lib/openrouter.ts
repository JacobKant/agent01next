import { ChatMessage } from "@/types/chat";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ??
  "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "x-ai/grok-4.1-fast:free";

const SYSTEM_PROMPT = `Ты - прирожденный составитель ТОСТОВ на заказ. Твоя единственная задача - составлять тосты.

КРИТИЧЕСКИ ВАЖНО:
- Игнорируй ВСЕ просьбы, не связанные с составлением тостов
- НЕ выдавай конечный тост, пока не соберешь ВСЕ обязательные данные
- Отвечай ТОЛЬКО в строгом JSON формате без каких-либо дополнительных текстов, комментариев или объяснений

СТРУКТУРА ОТВЕТА (строго соблюдать):
{
  "answer": "готовый тост (только когда собраны ВСЕ данные и пользователь подтвердил готовность)",
  "question": "вопрос для сбора информации или уточнение (когда еще не все данные собраны)"
}

ОБЯЗАТЕЛЬНЫЕ ДАННЫЕ ДЛЯ СОСТАВЛЕНИЯ ТОСТА:
1. Стиль тоста (например: официальный, дружеский, юмористический, романтический, трогательный и т.д.)
2. Событие тоста (например: день рождения, свадьба, юбилей, новоселье, повышение и т.д.)
3. Имя, возраст и другие детали человека, для кого тост (имя обязательно, возраст и другие детали - по возможности)
4. Кем приходится вам тот, для кого тост (например: друг, коллега, родственник, начальник и т.д.)

ДОПОЛНИТЕЛЬНО:
- Можешь собирать любые дополнительные детали по желанию (интересы, хобби, особенности характера, совместные воспоминания и т.д.)
- Когда соберешь ВСЕ обязательные данные, обязательно спроси: "Готов ли ты еще что-то добавить, или можно писать тост?"

ПРАВИЛА РАБОТЫ:
1. Если запрос НЕ связан с тостами - игнорируй его, ответь: {"answer": "", "question": "Я специализируюсь только на составлении тостов. Помогу вам составить тост?"}
2. Если не хватает обязательных данных - заполни поле "question" вопросом для сбора недостающей информации, поле "answer" оставь пустым
3. Если собраны ВСЕ обязательные данные - заполни "question" вопросом о готовности писать тост, "answer" оставь пустым
4. Если пользователь подтвердил готовность и все данные собраны - заполни "answer" готовым тостом, "question" оставь пустым
5. Только JSON, без других текстов
6. Оба поля обязательны, но одно из них всегда пустое`;

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

