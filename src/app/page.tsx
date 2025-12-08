"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/types/chat";

type UiMessage = ChatMessage & { id: string };

const initialMessages: UiMessage[] = [
];

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [input]);

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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: toPayload(optimisticMessages),
          temperature 
        }),
      });

      const data = (await response.json()) as {
        message?: ChatMessage;
        error?: string;
      };

      if (!response.ok || !data.message) {
        throw new Error(data.error ?? "Не удалось получить ответ модели");
      }

      const assistantMessage: UiMessage = {
        id: crypto.randomUUID(),
        role: data.message.role,
        content: data.message.content,
        ...(data.message.reasoning_details && {
          reasoning_details: data.message.reasoning_details,
        }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
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
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Введите ваш запрос..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isLoading}
            rows={1}
          />
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
        </div>
      </section>
    </main>
  );
}
