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
};

type Provider = "openrouter" | "huggingface";

const initialMessages: UiMessage[] = [];

const OPENROUTER_MODELS = [
  "mistralai/devstral-2512:free",
  "openai/gpt-oss-120b:free",
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
  "openai/gpt-oss-120b:free": {
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

      const assistantMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: data.message.role,
        content: data.message.content,
        responseTime: responseTime,
        usage: data.usage,
        cost: cost,
        model: model,
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
        // затем добавляем ответ ассистента
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1]; // Текущий запрос пользователя
          return [summarizedUiMessage, lastMessage, assistantMessage];
        });
      } else {
        // Если суммаризации не было, просто добавляем ответ ассистента
        setMessages((prev) => [...prev, assistantMessage]);
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

  return (
    <main className="chat-container">
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
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message message-${message.role}`}
            >
              <p className="message-author">
                {message.role === "user" ? "Вы" : "AI"}
              </p>
              <p className="message-content">{message.content}</p>
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
                </div>
              )}
            </article>
          ))}
          {isLoading && (
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