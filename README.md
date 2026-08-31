EN | [RU](docs/README_RU.md)

# HolyVK

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)


Browser extension: on `vk.ru / web.vk.me` it shows a HolyWorld moderator's in-game nick and rank next to the profile name.

## Variants

| Folder | Browser |
|-------|---------|
| `chrome/` | Chrome / Chromium |
| `firefox/` | Firefox |
| `yandex/` | Yandex Browser |

## Build

```bash
./build.sh
```

Archives go to `dist/` (or `OUT=../builds ./build.sh` from the monorepo root).

## How it works (2.0)

1. Content script on `vk.ru / web.vk.me` fetches staff via proxy `journal.dosha.pw` (HMAC + AES), caches in `storage`.
2. Background warms the cache on alarm.
3. Popup: format presets, custom template `{nick}` / `{rank}`, rank color, nick tone (white <-> black).

Proxy (optional for deploy): `burmalda/`.

## Version

`2.0.0` - in `manifest.json` of each variant.
