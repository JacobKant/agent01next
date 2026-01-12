import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalIndex } from 'vectra';
import { getEmbedding } from './embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Улучшенная функция предобработки текста
function preprocessText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')  // Нормализация переносов строк
        .replace(/\n{3,}/g, '\n\n')  // Убираем избыточные переносы
        .replace(/\s{2,}/g, ' ')  // Убираем лишние пробелы
        .trim();
}

// Улучшенный сплиттер по предложениям и абзацам
function splitText(text: string, chunkSize: number, overlap: number): Array<{text: string, startPos: number, endPos: number}> {
    const chunks: Array<{text: string, startPos: number, endPos: number}> = [];
    
    // Если текст короче чем размер чанка, возвращаем как есть
    if (text.length <= chunkSize) {
        return [{
            text: text.trim(),
            startPos: 0,
            endPos: text.length
        }];
    }
    
    // Разбиваем текст на предложения для лучшего контроля
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let chunkStartPos = 0;
    let currentPos = 0;
    
    for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (!cleanSentence) continue;
        
        // Если добавление предложения превысит размер чанка
        if (currentChunk.length + cleanSentence.length > chunkSize && currentChunk.length > 0) {
            // Сохраняем текущий чанк
            chunks.push({
                text: currentChunk.trim(),
                startPos: chunkStartPos,
                endPos: chunkStartPos + currentChunk.length
            });
            
            // Начинаем новый чанк с перекрытием
            const words = currentChunk.split(/\s+/);
            const overlapWords = words.slice(-Math.floor(overlap / 10)); // Примерно overlap символов
            const overlapText = overlapWords.join(' ');
            
            currentChunk = overlapText + ' ' + cleanSentence;
            chunkStartPos = chunkStartPos + currentChunk.length - overlapText.length - cleanSentence.length - 1;
        } else {
            // Добавляем предложение к текущему чанку
            if (currentChunk.length > 0) {
                currentChunk += ' ' + cleanSentence;
            } else {
                currentChunk = cleanSentence;
                chunkStartPos = currentPos;
            }
        }
        
        currentPos += cleanSentence.length + 1; // +1 для пробела
    }
    
    // Добавляем последний чанк
    if (currentChunk.trim().length > 0) {
        chunks.push({
            text: currentChunk.trim(),
            startPos: chunkStartPos,
            endPos: currentPos
        });
    }
    
    return chunks;
}

// Функция для индексации одного файла
async function indexFile(index: LocalIndex, filePath: string, relativePath: string) {
    console.log(`\n📄 Обработка файла: ${relativePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Файл не найден: ${filePath}, пропускаем...`);
        return { processed: 0, errors: 0 };
    }
    
    const rawText = fs.readFileSync(filePath, 'utf-8');
    const preprocessedText = preprocessText(rawText);
    
    // Улучшенное разделение на чанки
    const chunks = splitText(preprocessedText, 1200, 200);
    console.log(`✂️ Текст разбит на ${chunks.length} чанков (размер: 1200 символов, перекрытие: 200)`);

    let processedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
            console.log(`   Обработка чанка ${i + 1}/${chunks.length}...`);
            
            // Получаем эмбеддинг через OpenRouter API
            const embedding = await getEmbedding(chunk.text);
            
            // Добавляем в индекс Vectra
            await index.insertItem({
                vector: embedding,
                metadata: {
                    text: chunk.text,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos,
                    chunkIndex: i,
                    documentPath: relativePath,
                    fileName: path.basename(filePath)
                }
            });
            
            processedCount++;
            
            // Небольшая задержка чтобы не перегружать API
            if ((i + 1) % 10 === 0) {
                console.log(`   Прогресс: обработано ${i + 1} из ${chunks.length} чанков.`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда задержки каждые 10 чанков
            }
        } catch (error) {
            console.error(`   ❌ Ошибка при обработке чанка ${i + 1}:`, error);
            errorCount++;
        }
    }
    
    console.log(`✅ Файл ${relativePath} обработан: ${processedCount} чанков, ${errorCount} ошибок`);
    return { processed: processedCount, errors: errorCount };
}

async function runPipeline() {
    console.log("📦 Инициализация Vectra индекса...");
    
    // Инициализируем индекс Vectra
    const indexPath = path.join(__dirname, 'vectra_index');
    const index = new LocalIndex(indexPath);

    // Создаем индекс если его нет
    if (!(await index.isIndexCreated())) {
        console.log("📁 Создание нового индекса...");
        await index.createIndex();
    } else {
        // Получаем количество элементов через listItems
        const items = await index.listItems();
        const existingCount = items.length;
        console.log(`📁 Использование существующего индекса (содержит ${existingCount} документов)...`);
        console.log("⚠️  Внимание: новые документы будут добавлены к существующим.");
    }

    // Определяем пути к файлам для индексации
    const projectRoot = path.resolve(__dirname, '..');
    const docPath = path.join(projectRoot, 'doc');
    const readmePath = path.join(projectRoot, 'README.md');
    
    // Собираем список файлов для индексации
    const filesToIndex: Array<{ path: string, relative: string }> = [];
    
    // Добавляем README.md из корня
    if (fs.existsSync(readmePath)) {
        filesToIndex.push({ path: readmePath, relative: 'README.md' });
    }
    
    // Добавляем все .md файлы из папки doc/
    if (fs.existsSync(docPath)) {
        const docFiles = fs.readdirSync(docPath).filter(file => file.endsWith('.md'));
        for (const file of docFiles) {
            const filePath = path.join(docPath, file);
            filesToIndex.push({ path: filePath, relative: `doc/${file}` });
        }
    }
    
    console.log(`\n📚 Найдено файлов для индексации: ${filesToIndex.length}`);
    filesToIndex.forEach((file, idx) => {
        console.log(`   ${idx + 1}. ${file.relative}`);
    });
    
    if (filesToIndex.length === 0) {
        console.warn("⚠️  Не найдено файлов для индексации!");
        return;
    }

    // Генерируем эмбеддинги и добавляем в индекс
    console.log("\n🧠 Генерация эмбеддингов через OpenRouter API...");
    
    let totalProcessed = 0;
    let totalErrors = 0;
    
    for (const file of filesToIndex) {
        const result = await indexFile(index, file.path, file.relative);
        totalProcessed += result.processed;
        totalErrors += result.errors;
    }
    
    console.log("\n✅ Индексация завершена!");
    console.log(`📊 Общая статистика:`);
    console.log(`   - Обработано файлов: ${filesToIndex.length}`);
    console.log(`   - Всего чанков: ${totalProcessed}`);
    console.log(`   - Ошибок: ${totalErrors}`);
    console.log(`   - Индекс сохранен в: ${indexPath}`);
}

runPipeline().catch(console.error);
