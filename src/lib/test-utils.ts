/**
 * Утилиты для тестирования
 * ВНИМАНИЕ: Этот файл создан для тестирования PR ревью
 */

// Функция без обработки ошибок - потенциальная проблема
export function unsafeDivide(a: number, b: number): number {
  return a / b; // Может вернуть Infinity или NaN при b = 0
}

// Функция с console.log вместо правильного логирования
export function logMessage(message: string) {
  console.log(message); // Должно использовать систему логирования проекта
}

// Неиспользуемая переменная
const unusedVariable = "test";

// Функция с any типом - плохая практика
export function processData(data: any): any {
  return data;
}
