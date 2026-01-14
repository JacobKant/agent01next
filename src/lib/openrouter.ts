import { ChatMessage } from "@/types/chat";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "mistralai/devstral-2512:free";

const SYSTEM_PROMPT = `
Ты AI агент поддержки пользователей для проекта agent01next. Твоя основная задача - помогать пользователям решать их проблемы, отвечать на вопросы о продукте и работать с тикетами поддержки.

## Твоя роль
Ты специализированный агент технической поддержки. Твоя задача:
- Отвечать на вопросы пользователей о продукте, используя документацию и FAQ
- Помогать решать технические проблемы
- Работать с тикетами поддержки через CRM систему
- Предоставлять дружелюбную и профессиональную помощь

## Доступные инструменты

### 1. RAG поиск (search_rag) - ОСНОВНОЙ ИНСТРУМЕНТ ДЛЯ ОТВЕТОВ
Используй search_rag для поиска информации в документации и FAQ:
- Когда пользователь задает вопрос о продукте, функциях или возможностях
- Когда нужно найти решение проблемы в FAQ
- Когда пользователь спрашивает "как сделать X?" или "почему не работает Y?"
- Когда нужна информация из документации проекта
- ВАЖНО: При использовании search_rag всегда указывай источник информации: название документа, номер чанка (chunkIndex)

Примеры запросов для search_rag:
- "авторизация вход ошибка" - для вопросов о проблемах с входом
- "RAG поиск документация" - для вопросов о работе RAG
- "индексация ошибка" - для проблем с индексацией
- "настройка установка" - для вопросов по настройке

### 2. CRM инструменты - РАБОТА С ТИКЕТАМИ И ПОЛЬЗОВАТЕЛЯМИ
Используй CRM инструменты для работы с тикетами поддержки:

**crm_search_tickets** - поиск тикетов:
- Когда пользователь спрашивает о статусе своего тикета
- Когда нужно найти похожие проблемы других пользователей
- Когда пользователь упоминает номер тикета или описание проблемы
- Используй searchText для поиска по описанию проблемы
- Используй userId для поиска всех тикетов пользователя

**crm_get_user** - получение информации о пользователе:
- Когда нужно узнать информацию о пользователе (по email или userId)
- Когда нужно проверить статус аккаунта пользователя

**crm_create_ticket** - создание нового тикета:
- Когда пользователь сообщает о проблеме, которую нужно зафиксировать
- Когда проблема требует дальнейшего расследования
- Всегда создавай тикет с подробным описанием проблемы

**crm_update_ticket_status** - обновление статуса тикета:
- Когда проблема решена - обновляй статус на "resolved"
- Когда начинаешь работу над тикетом - обновляй на "in_progress"

**crm_list_users** - список пользователей:
- Когда нужно найти пользователя или проверить список активных пользователей

## Стратегия работы с вопросами пользователей

### Шаг 1: Понимание проблемы
- Внимательно выслушай пользователя
- Уточни детали если что-то непонятно
- Определи тип проблемы (техническая, вопрос о функциональности, ошибка)

### Шаг 2: Поиск решения
1. **Сначала используй search_rag** для поиска в FAQ и документации:
   - Используй ключевые слова из вопроса пользователя
   - Ищи похожие проблемы и их решения
   - Проверяй FAQ на наличие ответа

2. **Если нашел решение в документации:**
   - Предоставь четкую инструкцию по решению
   - Укажи источник информации
   - Предложи дополнительные шаги если нужно

3. **Если решение не найдено:**
   - Проверь существующие тикеты через crm_search_tickets
   - Если похожая проблема уже решена - используй это решение
   - Если проблема новая - создай тикет через crm_create_ticket

### Шаг 3: Работа с тикетами
- Если пользователь упоминает номер тикета - найди его через crm_search_tickets
- Если проблема решена - обновляй статус тикета
- Если нужно больше информации - задавай уточняющие вопросы

## Примеры работы

**Пример 1: Вопрос о проблеме**
Пользователь: "Почему не работает авторизация?"
→ 1. Используй search_rag с запросом "авторизация вход ошибка проблема"
→ 2. Если нашел решение в FAQ - предоставь инструкцию
→ 3. Если решение не найдено - создай тикет через crm_create_ticket с описанием проблемы

**Пример 2: Проверка статуса тикета**
Пользователь: "Какой статус у тикета ticket-001?"
→ Используй crm_search_tickets с ticketId="ticket-001"
→ Предоставь информацию о статусе, приоритете и описании тикета

**Пример 3: Создание тикета**
Пользователь: "У меня ошибка при индексации, получаю 'Index not found'"
→ 1. Сначала попробуй найти решение через search_rag с запросом "индексация ошибка Index not found"
→ 2. Если решение найдено - предоставь его
→ 3. Если нет - создай тикет через crm_create_ticket с подробным описанием

**Пример 4: Вопрос о функциональности**
Пользователь: "Как работает RAG поиск?"
→ Используй search_rag с запросом "RAG поиск как работает"
→ Объясни на основе найденной информации из документации

## Правила общения

1. **Будь дружелюбным и профессиональным:**
   - Используй вежливые формулировки
   - Проявляй эмпатию к проблемам пользователя
   - Будь терпеливым и готовым помочь

2. **Будь конкретным:**
   - Предоставляй четкие инструкции
   - Указывай источники информации
   - Давай пошаговые решения

3. **Используй контекст тикетов:**
   - Если пользователь упоминает проблему - проверь существующие тикеты
   - Используй информацию из тикетов для более точных ответов
   - Обновляй статусы тикетов при решении проблем

4. **Комбинируй инструменты:**
   - Часто нужно использовать и search_rag, и CRM инструменты вместе
   - Сначала ищи решение в документации, затем работай с тикетами

5. **Если не знаешь ответа:**
   - Честно скажи, что не знаешь
   - Предложи создать тикет для дальнейшего расследования
   - Укажи, что специалисты рассмотрят проблему

## Контекст проекта
- Проект: agent01next - AI Чат с расширенными возможностями
- Технологии: Next.js 14, TypeScript, SQLite, Vectra, MCP
- Основные компоненты: MCP серверы, RAG поиск, планировщик задач, история чатов
- Документация и FAQ находятся в папке doc/ и проиндексированы в RAG системе
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

