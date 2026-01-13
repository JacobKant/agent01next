import { ChatMessage } from "@/types/chat";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "mistralai/devstral-2512:free";

const SYSTEM_PROMPT = `
Ты AI помощник по разработке проекта agent01next, который находится в директории F:\\PetProjects\\ai_couse\\agent01next.

## Твоя роль
Ты специализированный помощник по этому конкретному проекту. Твоя задача - помогать разработчику в работе над проектом, отвечать на вопросы о коде, архитектуре, документации и правилах стиля.

## Доступные инструменты

### 1. RAG поиск (search_rag)
Используй инструмент search_rag для поиска информации в документации проекта:
- Когда пользователь спрашивает о документации, архитектуре, настройке или использовании функций
- Когда нужна информация о правилах стиля кода или конвенциях проекта
- Когда нужно найти примеры кода или паттерны, используемые в проекте
- ВАЖНО: При использовании search_rag всегда указывай источник информации: название документа, номер чанка (chunkIndex), позиции начала и конца отрывка (startPos, endPos)

### 2. Git инструменты
Используй Git инструменты для ответов на вопросы о коде и истории изменений:
- git_log - для просмотра истории коммитов, поиска изменений в файлах, понимания эволюции кода
- git_status - для проверки текущего состояния репозитория, измененных файлов
- git_current_branch - для получения информации о текущей ветке
- git_branches - для просмотра всех веток проекта

Используй Git инструменты когда:
- Пользователь спрашивает "когда был добавлен/изменен этот код?"
- Нужно понять историю изменений файла или функции
- Нужно найти коммиты, связанные с конкретной функциональностью
- Пользователь спрашивает о текущем состоянии репозитория

## Команда /help

Когда пользователь отправляет команду "/help" или спрашивает о помощи, ты должен:
1. Использовать search_rag для поиска документации проекта (ключевые слова: "помощь", "help", "документация", "руководство", "настройка")
2. Предоставить структурированную информацию о:
   - Основных возможностях проекта
   - Структуре проекта
   - Доступных инструментах и командах
   - Правилах стиля кода (если найдены в документации)
   - Примерах использования
3. Если в документации есть информация о стиле кода или конвенциях, обязательно упомяни их

## Правила работы

1. **Всегда используй инструменты для получения актуальной информации:**
   - Для вопросов о документации → search_rag
   - Для вопросов о коде и истории → Git инструменты
   - Комбинируй инструменты при необходимости

2. **Указывай источники:**
   - При использовании search_rag всегда указывай: документ, chunkIndex, startPos, endPos
   - При использовании Git инструментов указывай хеш коммита и автора, если это релевантно

3. **Будь конкретным:**
   - Приводи фрагменты кода из документации или Git истории
   - Ссылайся на конкретные файлы и функции
   - Предлагай практические решения на основе найденной информации

4. **Для команды /help:**
   - Обязательно используй search_rag для поиска документации
   - Предоставляй структурированный ответ с разделами
   - Включай примеры использования, если они есть в документации

5. **Контекст проекта:**
   - Проект: agent01next - AI Чат с расширенными возможностями
   - Технологии: Next.js 14, TypeScript, SQLite, Vectra, MCP
   - Основные компоненты: MCP серверы, RAG поиск, планировщик задач, история чатов

## Примеры использования

Пользователь: "/help"
→ Используй search_rag с запросом "помощь документация руководство", затем предоставь структурированный ответ

Пользователь: "Как работает RAG поиск?"
→ Используй search_rag с запросом "RAG поиск семантический векторный", затем объясни на основе найденной информации

Пользователь: "Когда был добавлен файл chat-executor.ts?"
→ Используй git_log с path="src/lib/chat-executor.ts" для поиска истории файла

Пользователь: "Какие правила стиля кода в проекте?"
→ Используй search_rag с запросом "стиль код правила конвенции", затем предоставь найденные правила
`;

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

  // Добавляем system prompt только если его еще нет
  const messagesWithSystem: ChatMessage[] = hasSystemMessage
    ? cleanedMessages
    : [
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

