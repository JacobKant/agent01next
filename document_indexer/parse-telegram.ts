import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  date_unixtime?: string;
  from?: string;
  from_id?: string;
  text?: string;
  text_entities?: any[];
}

interface TelegramChat {
  name: string;
  type: string;
  id: number;
  messages: TelegramMessage[];
}

function parseTelegramChat(inputPath: string, outputPath: string) {
  console.log(`Чтение файла: ${inputPath}`);
  
  // Читаем JSON файл
  const fileContent = readFileSync(inputPath, 'utf-8');
  const chatData: TelegramChat = JSON.parse(fileContent);
  
  console.log(`Найдено сообщений: ${chatData.messages.length}`);
  console.log(`Группа: ${chatData.name}`);
  
  // Вспомогательная функция для безопасного извлечения текста
  function extractText(text: any): string {
    if (typeof text === 'string') {
      return text;
    }
    if (Array.isArray(text)) {
      // Если text - массив, извлекаем текст из элементов
      return text.map(item => 
        typeof item === 'string' ? item : 
        (item?.text || '').toString()
      ).join(' ').trim();
    }
    if (text && typeof text === 'object') {
      // Если text - объект, пытаемся извлечь текстовое поле
      return (text.text || text.toString() || '').toString();
    }
    return (text || '').toString();
  }

  // Фильтруем и обрабатываем только текстовые сообщения
  const textMessages = chatData.messages
    .filter(msg => {
      if (msg.type !== 'message' || !msg.from) {
        return false;
      }
      const text = extractText(msg.text);
      return text.trim().length > 0;
    })
    .map(msg => ({
      date: msg.date,
      from: msg.from || 'Unknown',
      text: extractText(msg.text)
    }));
  
  console.log(`Текстовых сообщений: ${textMessages.length}`);
  
  // Формируем выходной формат: каждая строка - одно сообщение в формате TSV
  // Формат: DATE\tFROM\tTEXT
  const outputLines = textMessages.map(msg => {
    // Заменяем табуляции и переносы строк в тексте на пробелы для сохранения формата TSV
    const cleanText = msg.text
      .replace(/\t/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .trim();
    
    const cleanFrom = msg.from.replace(/\t/g, ' ').trim();
    
    return `${msg.date}\t${cleanFrom}\t${cleanText}`;
  });
  
  // Добавляем заголовок
  const header = 'DATE\tFROM\tTEXT';
  const output = [header, ...outputLines].join('\n');
  
  // Сохраняем результат
  writeFileSync(outputPath, output, 'utf-8');
  
  console.log(`Результат сохранен в: ${outputPath}`);
  console.log(`Обработано сообщений: ${textMessages.length}`);
}

// Запуск скрипта
const inputFile = join(process.cwd(), 'data', 'telegaChat2.json');
const outputFile = join(process.cwd(), 'data', 'telegaChat2_parsed.txt');

try {
  parseTelegramChat(inputFile, outputFile);
  console.log('Парсинг завершен успешно!');
} catch (error) {
  console.error('Ошибка при парсинге:', error);
  process.exit(1);
}
