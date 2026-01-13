#!/usr/bin/env tsx

/**
 * Скрипт для автоматического ревью Pull Request
 * 
 * Использование:
 *   npm run pr-review -- --base main --head feature-branch
 *   npm run pr-review -- --pr-number 123
 *   npm run pr-review -- --base main --head HEAD
 */

import { executeChatWithMCP } from "../lib/chat-executor";
import { ChatMessage } from "../types/chat";
import { PR_REVIEW_SYSTEM_PROMPT } from "../lib/pr-review-prompt";

// Парсинг аргументов командной строки
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: {
    base?: string;
    head?: string;
    prNumber?: number;
    model?: string;
    temperature?: number;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base" && i + 1 < args.length) {
      parsed.base = args[++i];
    } else if (arg === "--head" && i + 1 < args.length) {
      parsed.head = args[++i];
    } else if (arg === "--pr-number" && i + 1 < args.length) {
      parsed.prNumber = parseInt(args[++i], 10);
    } else if (arg === "--model" && i + 1 < args.length) {
      parsed.model = args[++i];
    } else if (arg === "--temperature" && i + 1 < args.length) {
      parsed.temperature = parseFloat(args[++i]);
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();

  // Определяем ветки для сравнения
  let baseBranch = args.base || "main";
  let headBranch = args.head || "HEAD";

  console.log("🔍 Начинаю ревью PR...");
  console.log(`📊 Базовая ветка: ${baseBranch}`);
  console.log(`📊 Ветка с изменениями: ${headBranch}`);

  if (args.prNumber) {
    console.log(`📊 PR номер: ${args.prNumber}`);
  }

  // Формируем запрос для агента
  const userMessage: ChatMessage = {
    role: "user",
    content: args.prNumber
      ? `Сделай ревью Pull Request #${args.prNumber}. Используй git_diff для получения изменений между базовой веткой и веткой PR.`
      : `Сделай ревью изменений между ветками ${baseBranch} и ${headBranch}. Используй git_diff для получения изменений.`,
  };

  // Создаем сообщения с системным промптом для PR ревью
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: PR_REVIEW_SYSTEM_PROMPT,
    },
    userMessage,
  ];

  try {
    console.log("\n🤖 Запускаю агента для анализа PR...\n");

    // Выполняем чат с MCP инструментами
    const result = await executeChatWithMCP(
      messages,
      args.model,
      args.temperature || 0.7, // Немного ниже температура для более структурированного ответа
      8000 // Больше токенов для детального ревью
    );

    console.log("\n" + "=".repeat(80));
    console.log("📝 РЕЗУЛЬТАТ РЕВЬЮ PR");
    console.log("=".repeat(80) + "\n");

    // Выводим результат ревью
    if (typeof result.message.content === "string") {
      console.log(result.message.content);
    } else if (Array.isArray(result.message.content)) {
      const textParts = result.message.content
        .filter((item: any) => item.type === "text")
        .map((item: any) => item.text || "")
        .join("");
      console.log(textParts);
    }

    console.log("\n" + "=".repeat(80));
    console.log("📊 Статистика:");
    if (result.usage) {
      console.log(`   Токены: ${result.usage.total_tokens} (вход: ${result.usage.prompt_tokens}, выход: ${result.usage.completion_tokens})`);
    }
    if (result.executedTools && result.executedTools.length > 0) {
      console.log(`   Использовано инструментов: ${result.executedTools.length}`);
      result.executedTools.forEach((tool) => {
        console.log(`     - ${tool.name}`);
      });
    }
    console.log("=".repeat(80) + "\n");

    // Возвращаем код выхода в зависимости от результата
    // Если есть критичные замечания, можно вернуть ненулевой код
    const reviewText = typeof result.message.content === "string" 
      ? result.message.content 
      : "";

    // Простая проверка на наличие критичных замечаний
    const hasCriticalIssues = reviewText.includes("Критичные") || 
                              reviewText.includes("требуют исправления") ||
                              reviewText.toLowerCase().includes("critical");

    if (hasCriticalIssues) {
      console.log("⚠️  Обнаружены критичные замечания в PR!");
      process.exit(1);
    } else {
      console.log("✅ Ревью завершено. Критичных замечаний не обнаружено.");
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Ошибка при выполнении ревью PR:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Критическая ошибка:", error);
  process.exit(1);
});
