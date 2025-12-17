/**
 * Утилиты для работы с Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BASE_URL = "https://api.telegram.org/bot";

/**
 * Отправляет сообщение в Telegram чат
 * @param chatId ID чата (может быть числом или строкой с username)
 * @param text Текст сообщения
 * @param parseMode Режим парсинга (HTML, Markdown, MarkdownV2)
 * @returns Promise с результатом отправки
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  parseMode: "HTML" | "Markdown" | "MarkdownV2" = "HTML"
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN не найден. Добавьте токен в .env.local и перезапустите сервер."
    );
  }

  const url = `${TELEGRAM_BASE_URL}${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Telegram API вернул ошибку ${response.status}: ${JSON.stringify(errorData)}`
      );
    }

    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(`Telegram API ошибка: ${result.description || "Неизвестная ошибка"}`);
    }

    console.log(`[Telegram] Сообщение отправлено в чат ${chatId}`);
  } catch (error) {
    console.error("[Telegram] Ошибка при отправке сообщения:", error);
    throw error;
  }
}

