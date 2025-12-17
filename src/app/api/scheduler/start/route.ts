import { NextResponse } from "next/server";
import { getTasks } from "@/lib/scheduler";

export async function GET() {
  try {
    // Планировщик уже инициализирован через server-init
    const tasks = getTasks();
    
    return NextResponse.json({
      success: true,
      message: "Планировщик запущен",
      tasks: tasks.map((task) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        cronExpression: task.cronExpression,
        enabled: task.enabled,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

