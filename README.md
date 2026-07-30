# HolyVK

Браузерное расширение: в `vk.ru / web.vk.me` рядом с ФИО показывает игровой ник и должность модератора HolyWorld.

## Варианты

| Папка | Браузер |
|-------|---------|
| `chrome/` | Chrome / Chromium |
| `firefox/` | Firefox |
| `yandex/` | Яндекс.Браузер |

## Сборка

```bash
./build.sh
```

Архивы → `dist/` (или `OUT=../builds ./build.sh` из корня monorepo).

## Как работает (2.0)

1. Content-скрипт на `vk.ru / web.vk.me` тянет staff через прокси `journal.dosha.pw` (HMAC + AES), кэширует в `storage`.
2. Background прогревает кэш по alarm.
3. Popup: пресеты формата, свой шаблон `{nick}` / `{rank}`, цвет должности, тон ника (белый ↔ чёрный).

Прокси (опционально для деплоя): `burmalda/`.

## Версия

`2.0.0` — в `manifest.json` каждого варианта.
