# Example release

Это пример релиза, который показывает “каноничный” формат snapshot-папки.

## Куда класть файлы

- `release.yaml`: метаданные релиза (валидируются Zod схемой `ReleaseMetadataSchema`)
- `i18n/<lang>/title.txt`: заголовок
- `i18n/<lang>/description.txt`: описание
- `i18n/<lang>/changelog.txt`: чейнджлог
- `artifacts/`: `.apk`/`.aab` (файлы артефактов не коммитим, пример держим пустым)
- `media/screenshots/<deviceType>/`: скриншоты (phone/tablet/…)

