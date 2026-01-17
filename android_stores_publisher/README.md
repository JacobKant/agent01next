# AppDeployer (RuStore + Huawei AppGallery)

Модульная система для управления Android релизами и публикации в сторы. **Source of Truth — файловая система**.

## Предложенная структура проекта

```
.
├─ .env                            # (git-ignored) переменные окружения с credentials
├─ storage/
│  └─ releases/
│     └─ [version_code]/
│        ├─ release.yaml          # метаданные релиза + статус + store-флаги
│        ├─ i18n/
│        │  └─ [lang_code]/
│        │     ├─ title.txt
│        │     ├─ description.txt
│        │     └─ changelog.txt
│        ├─ artifacts/            # apk/aab
│        └─ media/
│           └─ screenshots/
│              └─ [device_type]/  # phone/tablet/tv/...
├─ src/
│  ├─ app/                        # Next.js App Router (Web UI + API routes)
│  │  ├─ api/
│  │  │  └─ releases/
│  │  │     ├─ route.ts
│  │  │     └─ [versionCode]/route.ts
│  │  └─ page.tsx
│  ├─ cli/
│  │  └─ deploy.ts                # CLI публикации
│  ├─ core/
│  │  ├─ credentials/             # чтение секретов
│  │  ├─ publisher/               # PublisherCore + registry провайдеров
│  │  ├─ storage/                 # FS CRUD snapshot-схемы
│  │  └─ types/                   # Zod-схемы и типы
│  └─ providers/
│     └─ rustore/
│        ├─ RuStoreClient.ts
│        └─ RuStoreProvider.ts
└─ package.json
```

## Security

- Секреты **не хранятся** внутри `storage/releases/**`.
- Используем переменные окружения из файла `.env` (в `.gitignore`).

## Настройка credentials

Credentials настраиваются через переменные окружения в файле `.env`.

### Настройка переменных окружения

Для работы с RuStore необходимо настроить переменные окружения. Скопируйте файл `env.example` в `.env` и заполните значения:

```bash
cp env.example .env
```

### Описание переменных окружения для RuStore

#### Обязательные переменные

- **RUSTORE_KEY_ID** — Key ID для key-based аутентификации
  - Получить можно в личном кабинете RuStore в разделе API
  - Используется для подписи запросов с помощью приватного ключа
  - Обязательно

- **RUSTORE_PRIVATE_KEY_BASE_64** — Приватный ключ в формате Base64
  - Получить можно в личном кабинете RuStore в разделе API
  - Приватный ключ должен быть в формате Base64 (как предоставляет RuStore)
  - Обязательно

#### Опциональные переменные

- **RUSTORE_API_BASE_URL** — Базовый URL API RuStore
  - Обычно не требуется, используется значение по умолчанию: `https://public-api.rustore.ru`
  - Указывайте только для тестовых окружений или sandbox
  - Пример: `https://public-api.rustore.ru`

- **RUSTORE_PACKAGE_NAME** — Package name приложения (например, `com.example.myapp`)
  - **Обязательный параметр** для работы с RuStore API
  - Можно указать здесь или в `release.yaml` для каждого релиза отдельно
  - Если не указан, должен быть указан в `release.yaml` в `stores.rustore.packageName`

- **RUSTORE_APP_ID** — (Устарел) ID приложения в RuStore
  - Параметр устарел, используйте `RUSTORE_PACKAGE_NAME` вместо него
  - Можно указать здесь или в `release.yaml` для каждого релиза отдельно

### Пример заполнения .env файла

```env
RUSTORE_KEY_ID=your_key_id
RUSTORE_PRIVATE_KEY_BASE_64=your_private_key_base64_here
RUSTORE_PACKAGE_NAME=com.example.myapp
```

