import cron from "node-cron";
import { callOpenRouter } from "./openrouter";
import { ChatMessage } from "@/types/chat";

// Тип для задачи
export type ScheduledTask = {
  id: string;
  name: string;
  description?: string;
  cronExpression: string; // Cron выражение для расписания
  enabled: boolean;
  execute: () => Promise<void>;
};

// Хранилище задач
const tasks: ScheduledTask[] = [];

// Регистрация задачи
export function registerTask(task: ScheduledTask): void {
  tasks.push(task);
  console.log(`[Scheduler] Зарегистрирована задача: ${task.name} (${task.id})`);
}

// Получение всех задач
export function getTasks(): ScheduledTask[] {
  return tasks;
}

// Запуск планировщика
let schedulerStarted = false;
const scheduledTaskIds = new Set<string>(); // Отслеживаем уже запланированные задачи

export function startScheduler(): void {
  console.log("[Scheduler] Запуск планировщика задач...");

  // Запускаем каждую задачу по её расписанию
  let newTasksCount = 0;
  tasks.forEach((task) => {
    // Пропускаем уже запланированные задачи
    if (scheduledTaskIds.has(task.id)) {
      return;
    }

    if (!task.enabled) {
      console.log(`[Scheduler] Задача ${task.name} отключена, пропускаем`);
      return;
    }

    try {
      cron.schedule(task.cronExpression, async () => {
        console.log(`[Scheduler] Выполнение задачи: ${task.name} (${task.id})`);
        try {
          await task.execute();
          console.log(`[Scheduler] Задача ${task.name} выполнена успешно`);
        } catch (error) {
          console.error(`[Scheduler] Ошибка при выполнении задачи ${task.name}:`, error);
        }
      });
      scheduledTaskIds.add(task.id);
      newTasksCount++;
      console.log(`[Scheduler] Задача ${task.name} запланирована: ${task.cronExpression}`);
    } catch (error) {
      console.error(`[Scheduler] Ошибка при планировании задачи ${task.name}:`, error);
    }
  });

  schedulerStarted = true;
  if (newTasksCount > 0) {
    console.log(`[Scheduler] Планировщик запущен. Новых задач запланировано: ${newTasksCount}, всего задач: ${tasks.length}`);
  } else if (scheduledTaskIds.size > 0) {
    console.log(`[Scheduler] Планировщик уже запущен. Все задачи уже запланированы (всего: ${tasks.length})`);
  } else {
    console.log(`[Scheduler] Планировщик запущен. Всего задач: ${tasks.length}`);
  }
}

// Остановка планировщика (для тестирования)
export function stopScheduler(): void {
  schedulerStarted = false;
  scheduledTaskIds.clear();
  console.log("[Scheduler] Планировщик остановлен");
}

