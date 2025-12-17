// Импортируем все задачи
import { currencyTask } from "./currency-task";
import { registerTask } from "../scheduler";

// Регистрируем все задачи
export function registerAllTasks(): void {
  registerTask(currencyTask);
  
  // Здесь можно добавлять новые задачи:
  // registerTask(anotherTask);
  // registerTask(yetAnotherTask);
}

