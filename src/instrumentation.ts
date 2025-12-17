// Файл для инициализации при старте сервера Next.js
// Выполняется один раз при запуске сервера (только на Node.js runtime)

export async function register() {
  console.log('[Instrumentation] NEXT_RUNTIME:', process.env.NEXT_RUNTIME);
  
  // Проверяем, что код выполняется на стороне сервера
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('[Instrumentation] Инициализация планировщика задач...');
      const { initializeScheduler } = await import('./lib/scheduler-init');
      initializeScheduler();
      console.log('[Instrumentation] Планировщик успешно инициализирован');
    } catch (error) {
      console.error('[Instrumentation] Ошибка при инициализации планировщика:', error);
      if (error instanceof Error) {
        console.error('[Instrumentation] Stack trace:', error.stack);
      }
    }
  } else {
    console.log('[Instrumentation] Пропуск инициализации (не Node.js runtime)');
  }
}