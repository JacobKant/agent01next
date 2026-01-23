import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "analyst");

// Убеждаемся, что директория существует
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    // Проверяем формат файла
    const fileName = file.name;
    const ext = fileName.toLowerCase().split(".").pop();
    const allowedFormats = ["csv", "json", "log", "txt"];

    if (!ext || !allowedFormats.includes(ext)) {
      return NextResponse.json(
        {
          error: `Неподдерживаемый формат файла. Разрешенные форматы: ${allowedFormats.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Читаем содержимое файла
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Сохраняем файл
    const filePath = join(DATA_DIR, fileName);
    writeFileSync(filePath, buffer);

    return NextResponse.json(
      {
        success: true,
        fileName,
        filePath,
        size: buffer.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Ошибка при загрузке файла:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Неизвестная ошибка",
      },
      { status: 500 }
    );
  }
}
