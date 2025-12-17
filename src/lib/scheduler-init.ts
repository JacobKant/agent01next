// Файл для инициализации планировщика
// Вызывается через instrumentation.ts при старте сервера Next.js
import { registerAllTasks } from "./tasks";
import { startScheduler } from "./scheduler";

let initialized = false;

export function initializeScheduler(): void {
  if (initialized) {
    return;
  }

  // Регистрируем все задачи
  registerAllTasks();
  
  // Запускаем планировщик
  startScheduler();
  
  initialized = true;
}

