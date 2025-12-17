import { ScheduledTask } from "../scheduler";

// Пример задачи - можно использовать как шаблон для создания новых задач
export const exampleTask: ScheduledTask = {
  id: "example-task",
  name: "Пример задачи",
  description: "Это пример задачи, которую можно использовать как шаблон",
  // Запускается каждый день в 12:00
  cronExpression: "0 12 * * *",
  enabled: false, // По умолчанию отключена
  execute: async () => {
    try {
      console.log("[Example Task] Выполнение примера задачи...");
      
      // Здесь ваша логика
      // Например: отправка запроса, работа с БД, отправка уведомлений и т.д.
      
      console.log("[Example Task] Задача выполнена успешно");
    } catch (error) {
      console.error("[Example Task] Ошибка при выполнении задачи:", error);
      throw error;
    }
  },
};

