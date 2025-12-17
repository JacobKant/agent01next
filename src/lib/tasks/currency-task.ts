import { ChatMessage } from "@/types/chat";
import { ScheduledTask } from "../scheduler";
import { sendTelegramMessage } from "../telegram";
import { executeChatWithMCP } from "../chat-executor";

// Задача: запрос к OpenRouter о валюте
export const currencyTask: ScheduledTask = {
  id: "currency-check",
  name: "Проверка валюты",
  description: "Запрашивает у AI какая валюта больше всего выросла за сегодня",
  // Запускается каждый час в 15 минут (например: 00:15, 01:15, 02:15 и т.д.)
  // Можно изменить на другое время, например "0 9 * * *" для запуска в 9:00 каждый день
  cronExpression: "55 * * * *", // Каждый час в 15 минут
  enabled: true,
  execute: async () => {
    try {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Какая валюта больше всего выросла за сегодня?",
        },
      ];

      console.log("[Currency Task] Отправка запроса в OpenRouter с MCP инструментами...");
      
      const result = await executeChatWithMCP(
        messages,
        "mistralai/devstral-2512:free", // Используем указанную модель
        1.0, // temperature
        undefined // max_tokens
      );

      console.log("[Currency Task] Получен ответ:", result.message.content);
      console.log("[Currency Task] Использовано токенов:", result.usage);
      
      if (result.executedTools && result.executedTools.length > 0) {
        console.log("[Currency Task] Выполнено инструментов:", result.executedTools.length);
      }

      // Отправляем финальный ответ в Telegram
      if (result.message.content) {
        try {
          const telegramMessage = `💱 <b>Информация о валютах</b>\n\n${result.message.content}`;
          await sendTelegramMessage("32448728", telegramMessage);
          console.log("[Currency Task] Ответ отправлен в Telegram");
        } catch (telegramError) {
          console.error("[Currency Task] Ошибка при отправке в Telegram:", telegramError);
          // Не прерываем выполнение задачи, если Telegram недоступен
        }
      }
    } catch (error) {
      console.error("[Currency Task] Ошибка при выполнении задачи:", error);
      throw error;
    }
  },
};

