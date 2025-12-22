import fs from 'fs';
import { pipeline } from '@xenova/transformers';

// Функция для вычисления схожести векторов
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        mA += vecA[i] * vecA[i];
        mB += vecB[i] * vecB[i];
    }
    const similarity = dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
    return isNaN(similarity) ? 0 : similarity;
}

// Улучшенная функция поиска с контекстом
function search(
    queryVector: number[], 
    index: Array<{vector: number[], text: string, startPos: number, endPos: number}>, 
    topK: number = 3,
    minScore: number = 0.2
) {
    const results = index
        .map((item, idx) => ({
            ...item,
            score: cosineSimilarity(queryVector, item.vector),
            index: idx
        }))
        .filter(item => item.score >= minScore) // Фильтр по минимальному порогу
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    
    // Если результатов слишком мало, снижаем порог
    if (results.length === 0 && minScore > 0.05) {
        console.log(`⚠️ Результатов с порогом ${minScore} не найдено. Снижаем порог до 0.05...`);
        return search(queryVector, index, topK, 0.05);
    }
    
    // Если даже с низким порогом ничего не найдено, возвращаем пустой массив
    if (results.length === 0) {
        return [];
    }
    
    // Добавляем контекст: соседние чанки для лучшего понимания
    return results.map(result => {
        const contextChunks = [];
        
        // Предыдущий чанк для контекста
        if (result.index > 0) {
            contextChunks.push({
                type: 'previous',
                text: index[result.index - 1].text
            });
        }
        
        // Основной найденный чанк
        contextChunks.push({
            type: 'main',
            text: result.text
        });
        
        // Следующий чанк для контекста
        if (result.index < index.length - 1) {
            contextChunks.push({
                type: 'next',
                text: index[result.index + 1].text
            });
        }
        
        return {
            ...result,
            contextChunks,
            textWithContext: contextChunks.map(chunk => chunk.text).join('\n\n--- --- ---\n\n')
        };
    });
}

// Функция для расширения запроса синонимами
function expandQuery(query: string): string[] {
    const synonyms: {[key: string]: string[]} = {
        'герой': ['персонаж', 'характер', 'главный', 'protagonist'],
        'главный': ['основной', 'центральный', 'ключевой'],
        'лисица': ['лиса', 'оборотень', 'лисий'],
        'оборотень': ['превращение', 'трансформация', 'лисица'],
        'что': ['какой', 'что такое', 'кто'],
        'кто': ['какой', 'персонаж', 'герой']
    };
    
    const words = query.toLowerCase().split(/\s+/);
    const expandedTerms = new Set([query.toLowerCase()]);
    
    words.forEach(word => {
        expandedTerms.add(word);
        if (synonyms[word]) {
            synonyms[word].forEach(synonym => expandedTerms.add(synonym));
        }
    });
    
    return Array.from(expandedTerms);
}

async function runSearch(query: string) {
    console.log("📦 Загрузка локальной модели эмбеддингов...");
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    // Загружаем индекс
    console.log("📄 Загрузка индекса...");
    const indexRaw = fs.readFileSync('index.json', 'utf-8');
    const index = JSON.parse(indexRaw);
    
    console.log(`📊 Загружено ${index.length} чанков из индекса`);

    // Расширяем запрос
    const expandedQueries = expandQuery(query);
    console.log(`🔍 Поиск по запросу: "${query}"`);
    console.log(`🔄 Расширенный поиск включает: ${expandedQueries.join(', ')}`);

    // Генерируем эмбеддинги для всех вариантов запроса
    const queryVectors: number[][] = [];
    
    for (const expandedQuery of expandedQueries) {
        try {
            const queryOutput = await extractor(expandedQuery, { pooling: 'mean', normalize: true });
            queryVectors.push(Array.from(queryOutput.data as Float32Array));
        } catch (error) {
            console.error(`Ошибка при обработке запроса "${expandedQuery}":`, error);
        }
    }

    // Выполняем поиск для каждого варианта запроса и объединяем результаты
    const allResults: Array<any> = [];
    
    for (let i = 0; i < queryVectors.length; i++) {
        const queryVector = queryVectors[i];
        const results = search(queryVector, index, 5, 0.15);
        
        // Добавляем информацию о том, по какому запросу найден результат
        results.forEach(result => {
            result.searchQuery = expandedQueries[i];
            result.relevanceBoost = i === 0 ? 1.1 : 1.0; // Бустим оригинальный запрос
            result.adjustedScore = result.score * result.relevanceBoost;
        });
        
        allResults.push(...results);
    }

    // Убираем дубликаты и сортируем по скорректированному скору
    const uniqueResults = new Map<number, any>();
    
    allResults.forEach(result => {
        const existing = uniqueResults.get(result.index);
        if (!existing || result.adjustedScore > existing.adjustedScore) {
            uniqueResults.set(result.index, result);
        }
    });

    const finalResults = Array.from(uniqueResults.values())
        .sort((a, b) => b.adjustedScore - a.adjustedScore)
        .slice(0, 3);

    // Выводим результаты
    if (finalResults.length === 0) {
        console.log("❌ Релевантных результатов не найдено");
        console.log("💡 Попробуйте:");
        console.log("   - Использовать более простые слова");
        console.log("   - Изменить формулировку запроса");
        console.log("   - Указать конкретные имена или термины из текста");
        return;
    }

    console.log("✅ Результаты поиска:");
    console.log(`🎯 Найдено ${finalResults.length} релевантных результатов\n`);

    finalResults.forEach((result, i) => {
        console.log(`${'='.repeat(80)}`);
        console.log(`📍 РЕЗУЛЬТАТ ${i + 1}`);
        console.log(`🎯 Релевантность: ${(result.adjustedScore * 100).toFixed(1)}% (исходный запрос: "${result.searchQuery}")`);
        console.log(`📍 Позиция в тексте: ${result.startPos}-${result.endPos}`);
        console.log(`${'='.repeat(80)}`);
        
        if (result.contextChunks && result.contextChunks.length > 1) {
            // Показываем контекст
            result.contextChunks.forEach((chunk: any, chunkIndex: number) => {
                if (chunk.type === 'previous') {
                    console.log(`📄 ПРЕДЫДУЩИЙ КОНТЕКСТ:`);
                    console.log(chunk.text.slice(-200) + '...\n');
                } else if (chunk.type === 'main') {
                    console.log(`🎯 ОСНОВНОЙ РЕЗУЛЬТАТ:`);
                    console.log(chunk.text + '\n');
                } else if (chunk.type === 'next') {
                    console.log(`📄 СЛЕДУЮЩИЙ КОНТЕКСТ:`);
                    console.log('...' + chunk.text.slice(0, 200) + '\n');
                }
            });
        } else {
            console.log(result.text);
        }
        
        console.log(`${'='.repeat(80)}\n`);
    });

    // Статистика поиска
    console.log(`📊 СТАТИСТИКА ПОИСКА:`);
    console.log(`   - Обработано запросов: ${expandedQueries.length}`);
    console.log(`   - Всего кандидатов: ${allResults.length}`);
    console.log(`   - Финальных результатов: ${finalResults.length}`);
    console.log(`   - Максимальная релевантность: ${finalResults.length > 0 ? (finalResults[0].adjustedScore * 100).toFixed(1) + '%' : 'N/A'}`);
}

// Запускаем поиск
if (process.argv[2]) {
    runSearch(process.argv[2]).catch(console.error);
} else {
    console.error("❌ Пожалуйста, укажите поисковый запрос.");
    console.log("📝 Пример использования:");
    console.log("   npm run search \"кто главный герой\"");
    console.log("   npm run search \"что такое лисица оборотень\"");
    process.exit(1);
}