"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/types/chat";

type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type ModelPricing = {
  inputPricePer1MTokens: number; // цена за 1 миллион входных токенов (в долларах)
  outputPricePer1MTokens: number; // цена за 1 миллион выходных токенов (в долларах)
};

type UiMessage = ChatMessage & {
  id: string;
  responseTime?: number;
  usage?: TokenUsage;
  cost?: number;
  model?: string; // Сохраняем модель для пересчета стоимости
  toolsUsed?: Array<{
    id: string;
    name: string;
    arguments: unknown;
    result: string;
  }>;
};

type Provider = "openrouter" | "huggingface";

const initialMessages: UiMessage[] = [];

const OPENROUTER_MODELS = [
  "mistralai/devstral-2512:free",
  "google/gemma-3-27b-it:free",
];

const HUGGINGFACE_MODELS = [
  "deepseek-ai/DeepSeek-V3.2:novita",
  "Qwen/Qwen2.5-72B-Instruct:novita",
  "google/gemma-2-2b-it:nebius",
];

// Конфигурация расценок для моделей (цена за 1 миллион токенов в долларах)
const MODEL_PRICING: Record<string, ModelPricing> = {
  "mistralai/devstral-2512:free": {
    inputPricePer1MTokens: 0.0,
    outputPricePer1MTokens: 0.0,
  },
  "google/gemma-3-27b-it:free": {
    inputPricePer1MTokens: 0.0,
    outputPricePer1MTokens: 0.0,
  },
  "deepseek-ai/DeepSeek-V3.2:novita": {
    inputPricePer1MTokens: 0.27, 
    outputPricePer1MTokens: 0.40, 
  },
  "Qwen/Qwen2.5-72B-Instruct:novita": {
    inputPricePer1MTokens: 0.30, 
    outputPricePer1MTokens: 0.32, 
  },
  "google/gemma-2-2b-it:nebius": {
    inputPricePer1MTokens: 0.02, 
    outputPricePer1MTokens: 0.06, 
  },
};

// Функция для расчета стоимости
function calculateCost(
  usage: TokenUsage,
  pricing: ModelPricing
): number {
  const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.inputPricePer1MTokens;
  const outputCost =
    (usage.completion_tokens / 1_000_000) * pricing.outputPricePer1MTokens;
  return inputCost + outputCost;
}

// Функция для приблизительного подсчета токенов
// Используется эвристика: ~1 токен = 4 символа (для английского текста)
// Для русского текста может быть немного больше, но для приблизительной оценки подойдет
function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  // Учитываем пробелы и знаки препинания
  // Более точная оценка: делим на 3.5 для учета русского текста
  return Math.ceil(text.length / 3.5);
}

const toPayload = (messages: UiMessage[]): ChatMessage[] =>
  messages.map(({ role, content, reasoning_details }) => ({
    role,
    content,
    ...(reasoning_details ? { reasoning_details } : {}),
  }));

export default function ChatPage() {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(1.0);
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [model, setModel] = useState<string>(
    provider === "openrouter" ? OPENROUTER_MODELS[0] : HUGGINGFACE_MODELS[0]
  );
  const [maxTokens, setMaxTokens] = useState<string>("");
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [chatId, setChatId] = useState<string>("default");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [chats, setChats] = useState<Array<{ id: string; created_at: number; updated_at: number }>>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Функция для сохранения сообщения в БД
  const saveMessageToDb = async (message: UiMessage) => {
    try {
      // Убеждаемся, что content всегда строка (не null/undefined)
      const contentStr =
        message.content !== null && message.content !== undefined
          ? String(message.content)
          : "";

      const payload = {
        chatId,
        message: {
          id: message.id,
          role: message.role,
          content: contentStr,
          reasoning_details: message.reasoning_details,
          response_time: message.responseTime,
          usage: message.usage,
          cost: message.cost,
          model: message.model,
          tools_used: message.toolsUsed,
          tool_calls: message.tool_calls,
          tool_call_id: message.tool_call_id,
        },
      };

      console.log("[saveMessageToDb] Сохранение сообщения:", {
        messageId: message.id,
        role: message.role,
        contentLength: contentStr.length,
        hasToolCalls: !!message.tool_calls?.length,
        toolCallsCount: message.tool_calls?.length ?? 0,
        hasToolCallId: !!message.tool_call_id,
      });

      const response = await fetch("/api/chat/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[saveMessageToDb] Ошибка ответа:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
      }
    } catch (error) {
      console.error("Ошибка при сохранении сообщения:", error);
    }
  };

  // Загрузка списка всех чатов
  const loadChats = async () => {
    setIsLoadingChats(true);
    try {
      const response = await fetch("/api/chat/sessions");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error("Ошибка при загрузке списка чатов:", error);
    } finally {
      setIsLoadingChats(false);
    }
  };

  // Создание нового чата
  const createNewChat = async () => {
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: `chat-${Date.now()}` }),
      });
      if (response.ok) {
        const data = await response.json();
        await loadChats();
        setChatId(data.chat.id);
        setMessages([]);
      }
    } catch (error) {
      console.error("Ошибка при создании нового чата:", error);
    }
  };

  // Удаление чата
  const deleteChatById = async (chatIdToDelete: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Предотвращаем переключение на чат при клике на кнопку удаления
    
    if (!confirm("Вы уверены, что хотите удалить этот чат?")) {
      return;
    }

    try {
      const response = await fetch(`/api/chat/sessions?chatId=${chatIdToDelete}`, {
        method: "DELETE",
      });
      if (response.ok) {
        // Если удаляемый чат был активным, переключаемся на другой чат или создаем новый
        if (chatIdToDelete === chatId) {
          const remainingChats = chats.filter(chat => chat.id !== chatIdToDelete);
          if (remainingChats.length > 0) {
            setChatId(remainingChats[0].id);
          } else {
            // Если не осталось чатов, создаем новый
            await createNewChat();
          }
        }
        await loadChats();
      }
    } catch (error) {
      console.error("Ошибка при удалении чата:", error);
    }
  };

  // Загрузка истории чата при монтировании или смене chatId
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(`/api/chat/history?chatId=${chatId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Преобразуем сохраненные сообщения в формат UiMessage
            const loadedMessages: UiMessage[] = data.messages.map((msg: any) => {
              let reasoningDetails: Record<string, unknown> | undefined = undefined;
              if (msg.reasoning_details) {
                try {
                  reasoningDetails = JSON.parse(msg.reasoning_details);
                } catch (e) {
                  console.warn("Ошибка при парсинге reasoning_details:", e);
                }
              }
              
              return {
                id: msg.id,
                role: msg.role as ChatMessage["role"],
                content: msg.content,
                reasoning_details: reasoningDetails,
                responseTime: msg.response_time ?? undefined,
                usage: msg.usage_prompt_tokens
                  ? {
                      prompt_tokens: msg.usage_prompt_tokens,
                      completion_tokens: msg.usage_completion_tokens ?? 0,
                      total_tokens: msg.usage_total_tokens ?? 0,
                    }
                  : undefined,
                cost: msg.cost ?? undefined,
                model: msg.model ?? undefined,
                toolsUsed: msg.tools_used ?? undefined,
                tool_calls: msg.tool_calls ?? undefined,
                tool_call_id: msg.tool_call_id ?? undefined,
              };
            });
            setMessages(loadedMessages);
          } else {
            setMessages([]);
          }
        }
      } catch (error) {
        console.error("Ошибка при загрузке истории:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [chatId]);

  // Загрузка списка чатов при монтировании
  useEffect(() => {
    loadChats();
  }, []);

  // Обновление списка чатов после сохранения сообщения
  useEffect(() => {
    if (messages.length > 0) {
      loadChats();
    }
  }, [messages.length]);

  // Обновляем модель при смене провайдера
  useEffect(() => {
    setModel(
      provider === "openrouter" ? OPENROUTER_MODELS[0] : HUGGINGFACE_MODELS[0]
    );
  }, [provider]);

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  // Подсчет приблизительного количества токенов для текущего запроса
  useEffect(() => {
    if (!input.trim()) {
      setEstimatedTokens(0);
      return;
    }

    // Подсчитываем токены для всего запроса: история сообщений + текущий ввод
    const allMessagesText = [
      ...messages.map((m) => `${m.role}: ${m.content}`),
      `user: ${input}`,
    ].join("\n");

    const tokens = estimateTokens(allMessagesText);
    setEstimatedTokens(tokens);
  }, [input, messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    
    // Сохраняем сообщение пользователя в БД
    await saveMessageToDb(userMessage);
    
    setInput("");
    setIsLoading(true);
    setError(null);

    const startTime = performance.now();

    try {
      const requestBody: any = {
        messages: toPayload(optimisticMessages),
        temperature,
        model,
        provider,
      };

      // Добавляем параметр max_tokens/max_new_tokens только если поле заполнено
      if (maxTokens.trim()) {
        const maxTokensValue = parseInt(maxTokens.trim(), 10);
        if (!isNaN(maxTokensValue) && maxTokensValue > 0) {
          if (provider === "openrouter") {
            requestBody.max_tokens = maxTokensValue;
          } else {
            requestBody.max_new_tokens = maxTokensValue;
          }
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as {
        message?: ChatMessage;
        usage?: TokenUsage;
        error?: string;
        summarized?: {
          message: ChatMessage;
          originalCount: number;
        };
        tools?: Array<{
          id: string;
          name: string;
          arguments: unknown;
          result: string;
        }>;
        intermediateMessages?: ChatMessage[];
      };

      if (!response.ok || !data.message) {
        throw new Error(data.error ?? "Не удалось получить ответ модели");
      }

      const endTime = performance.now();
      const responseTime = (endTime - startTime) / 1000; // время в секундах

      // Рассчитываем стоимость, если есть информация о токенах и расценки для модели
      let cost: number | undefined;
      if (data.usage) {
        const pricing = MODEL_PRICING[model];
        if (pricing) {
          cost = calculateCost(data.usage, pricing);
        }
      }

      // Сохраняем все промежуточные сообщения (assistant с tool_calls и tool results)
      const intermediateUiMessages: UiMessage[] = [];
      if (data.intermediateMessages && data.intermediateMessages.length > 0) {
        for (const msg of data.intermediateMessages) {
          const contentStr =
            typeof msg.content === "string"
              ? msg.content
              : msg.content === null
              ? ""
              : Array.isArray(msg.content)
              ? msg.content
                  .filter((item: any) => item.type === "text")
                  .map((item: any) => item.text || "")
                  .join("")
              : "";

          const intermediateMsg: UiMessage = {
            id: crypto.randomUUID(),
            role: msg.role,
            content: contentStr,
            tool_calls: msg.tool_calls,
            tool_call_id: msg.tool_call_id,
            ...(msg.reasoning_details && {
              reasoning_details: msg.reasoning_details,
            }),
          };
          intermediateUiMessages.push(intermediateMsg);
          // Сохраняем промежуточное сообщение в БД сразу
          await saveMessageToDb(intermediateMsg);
        }
      }

      const assistantMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: data.message.role,
        content: data.message.content,
        responseTime: responseTime,
        usage: data.usage,
        cost: cost,
        model: model,
        toolsUsed: data.tools,
        ...(data.message.reasoning_details && {
          reasoning_details: data.message.reasoning_details,
        }),
      };

      // Если была выполнена суммаризация, заменяем историю на суммаризированное сообщение
      if (data.summarized) {
        const summarizedUiMessage: UiMessage = {
          id: crypto.randomUUID(),
          role: data.summarized.message.role,
          content: `[История чата суммирована] ${data.summarized.message.content}`,
          model: model,
        };

        // Заменяем все сообщения кроме последнего (текущий запрос пользователя) на суммаризированное,
        // затем добавляем промежуточные сообщения и ответ ассистента
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]; // Текущий запрос пользователя
          return [
            summarizedUiMessage,
            lastMessage,
            ...intermediateUiMessages,
            assistantMessage,
          ];
        });

        // Сохраняем все сообщения в БД
        await saveMessageToDb(summarizedUiMessage);
        // Промежуточные сообщения уже сохранены выше
        await saveMessageToDb(assistantMessage);
      } else {
        // Если суммаризации не было, добавляем промежуточные сообщения и ответ ассистента
        setMessages((prev) => [...prev, ...intermediateUiMessages, assistantMessage]);

        // Сохраняем все сообщения в БД
        // Промежуточные сообщения уже сохранены выше
        await saveMessageToDb(assistantMessage);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Неизвестная ошибка"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Форматирование даты для отображения
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "Вчера";
    } else if (days < 7) {
      return `${days} дн. назад`;
    } else {
      return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    }
  };

  return (
    <main className="chat-container">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Чаты</h2>
          <button
            className="new-chat-button"
            onClick={createNewChat}
            disabled={isLoadingChats}
            title="Создать новый чат"
          >
            +
          </button>
        </div>
        <div className="sidebar-chats">
          {isLoadingChats ? (
            <div className="sidebar-loading">Загрузка...</div>
          ) : chats.length === 0 ? (
            <div className="sidebar-empty">Нет сохраненных чатов</div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`sidebar-chat-item ${chat.id === chatId ? "active" : ""}`}
              >
                <button
                  className="chat-item-button"
                  onClick={() => setChatId(chat.id)}
                >
                  <div className="chat-item-content">
                    <div className="chat-item-title">
                      {chat.id === "default" ? "Основной чат" : `Чат ${chat.id.split("-")[1] || chat.id}`}
                    </div>
                    <div className="chat-item-date">{formatDate(chat.updated_at)}</div>
                  </div>
                </button>
                <button
                  className="chat-item-delete"
                  onClick={(e) => deleteChatById(chat.id, e)}
                  title="Удалить чат"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
      <section className="chat-window">
        <header className="chat-header">
          <div>
            <p className="chat-title">AI Chat</p>
          </div>
        </header>

        <div className="chat-provider-selector">
          <label className="provider-label">Провайдер:</label>
          <div className="provider-toggle">
            <button
              type="button"
              className={`provider-button ${provider === "openrouter" ? "active" : ""}`}
              onClick={() => setProvider("openrouter")}
              disabled={isLoading}
            >
              OpenRouter
            </button>
            <button
              type="button"
              className={`provider-button ${provider === "huggingface" ? "active" : ""}`}
              onClick={() => setProvider("huggingface")}
              disabled={isLoading}
            >
              Hugging Face
            </button>
          </div>
        </div>

        <div className="chat-model-selector">
          <label htmlFor="model-select" className="model-label">
            Модель:
          </label>
          <select
            id="model-select"
            className="model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isLoading}
          >
            {(provider === "openrouter" ? OPENROUTER_MODELS : HUGGINGFACE_MODELS).map(
              (modelOption) => (
                <option key={modelOption} value={modelOption}>
                  {modelOption}
                </option>
              )
            )}
          </select>
        </div>

        <div className="chat-messages">
          {isLoadingHistory && (
            <article className="message message-assistant">
              <p className="message-author">Загрузка истории...</p>
            </article>
          )}
          {!isLoadingHistory && messages.map((message) => (
            <article
              key={message.id}
              className={`message message-${message.role}`}
            >
              <p className="message-author">
                {message.role === "user"
                  ? "Вы"
                  : message.role === "tool"
                  ? "Инструмент"
                  : "AI"}
              </p>
              {message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0 ? (
                <div className="message-content">
                  {message.content && message.content.trim() && (
                    <p>{message.content}</p>
                  )}
                  <div className="message-tool-calls">
                    <p className="tool-calls-label">Вызов инструментов:</p>
                    {message.tool_calls.map((toolCall) => {
                      let args: any = {};
                      try {
                        args = JSON.parse(toolCall.function.arguments);
                      } catch {
                        args = {};
                      }
                      return (
                        <div key={toolCall.id} className="tool-call-item">
                          <span className="tool-call-name">
                            {toolCall.function.name}
                          </span>
                          <span className="tool-call-args">
                            {JSON.stringify(args, null, 2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="message-content">{message.content || ""}</p>
              )}
              {message.role === "assistant" && (
                <div className="message-meta">
                  {message.responseTime !== undefined && (
                    <span className="message-response-time">
                      {message.responseTime.toFixed(2)} сек
                    </span>
                  )}
                  {message.usage && (
                    <div className="message-tokens">
                      <span>
                        Вход: {message.usage.prompt_tokens} токенов
                      </span>
                      <span>
                        Выход: {message.usage.completion_tokens} токенов
                      </span>
                      {message.cost !== undefined && (
                        <span className="message-cost">
                          Стоимость: ${message.cost.toFixed(6)}
                        </span>
                      )}
                    </div>
                  )}
                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="message-tools">
                      <span>
                        Инструменты:{" "}
                        {message.toolsUsed.map((tool) => tool.name).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {message.role === "tool" && message.tool_call_id && (
                <div className="message-tool-result">
                  <span className="tool-result-label">Результат:</span>
                  <pre className="tool-result-content">
                    {typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content, null, 2)}
                  </pre>
                </div>
              )}
            </article>
          ))}
          {!isLoadingHistory && isLoading && (
            <article className="message message-assistant">
              <p className="message-author">AI</p>
              <div className="loading-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </article>
          )}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <div className="chat-input-wrapper">
          {estimatedTokens > 0 && (
              <div className="chat-tokens-info">
                ~{estimatedTokens} токенов
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Введите ваш запрос..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isLoading}
              rows={1}
            />
            
          </div>
          <button className="chat-button" type="submit" disabled={isLoading}>
            {isLoading ? "Отправка..." : "Отправить"}
          </button>
        </form>
        {error && <p className="chat-error">{error}</p>}

        <div className="chat-settings">
          <label htmlFor="temperature" className="temperature-label">
            Temperature: {temperature}
          </label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(event) => setTemperature(parseFloat(event.target.value))}
            disabled={isLoading}
            className="temperature-input"
          />
          <label htmlFor="max-tokens" className="max-tokens-label">
            Max Tokens:
          </label>
          <input
            id="max-tokens"
            type="number"
            min="1"
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
            disabled={isLoading}
            className="max-tokens-input"
            placeholder="Не ограничено"
          />
        </div>
      </section>
    </main>
  );
}