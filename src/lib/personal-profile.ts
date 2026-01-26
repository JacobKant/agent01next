import { readFileSync, existsSync } from "fs";
import { join } from "path";

let cachedProfile: string | null = null;

/**
 * Загружает персональный профиль из текстового файла
 * @returns Текст профиля пользователя или null, если файл не найден
 */
export function loadPersonalProfile(): string | null {
  // Используем кеш, если профиль уже загружен
  if (cachedProfile !== null) {
    return cachedProfile;
  }

  const profilePath = join(process.cwd(), "personal-profile.txt");

  if (!existsSync(profilePath)) {
    console.log("[personal-profile] Файл personal-profile.txt не найден, персонализация отключена");
    return null;
  }

  try {
    cachedProfile = readFileSync(profilePath, "utf-8");
    console.log("[personal-profile] Персональный профиль загружен успешно");
    return cachedProfile;
  } catch (error) {
    console.error("[personal-profile] Ошибка при загрузке профиля:", error);
    return null;
  }
}

/**
 * Получает персонализированный системный промпт
 * @param basePrompt - Базовый системный промпт
 * @returns Промпт с добавленной информацией о пользователе
 */
export function getPersonalizedSystemPrompt(basePrompt: string): string {
  const profileText = loadPersonalProfile();

  if (!profileText || profileText.trim() === "") {
    return basePrompt;
  }

  return `${basePrompt}

---

# ПЕРСОНАЛИЗАЦИЯ

${profileText.trim()}

---

ВАЖНО: Используй эту информацию для персонализации всех ответов. Учитывай предпочтения, стиль общения и цели пользователя при формировании ответов.`;
}
