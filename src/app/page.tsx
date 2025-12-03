"use client";

import { FormEvent, useState } from "react";
import { ChatMessage } from "@/types/chat";

type UiMessage = ChatMessage & { id: string };

const initialMessages: UiMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Привет! Я составитель тостов на заказ. Помогу вам создать идеальный тост для любого события. Начнем?",
  },
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
        body: JSON.stringify({ messages: toPayload(optimisticMessages) }),
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
            <p className="chat-title">Составитель Тостов</p>
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
          <input
            className="chat-input"
            placeholder="Введите ваш запрос..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isLoading}
          />
          <button className="chat-button" type="submit" disabled={isLoading}>
            {isLoading ? "Отправка..." : "Отправить"}
          </button>
        </form>
        {error && <p className="chat-error">{error}</p>}
      </section>
    </main>
  );
}
