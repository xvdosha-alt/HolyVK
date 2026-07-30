const runtime = globalThis.browser ?? globalThis.chrome;
const STAFF_REFRESH_MS = 10 * 60 * 1000;
const SETTINGS_KEY = "holyvk_settings";
const STAFF_STORAGE_KEY = "holyvk_staff_cache";
const MSG_TIMEOUT_MS = 8000;

const RANKS = [
  "Неизвестно",
  "Стажёр",
  "Мл. Сотрудник",
  "Сотрудник",
  "Сотрудник+",
  "Вед. Сотрудник",
  "Спектатор",
  "Ст. Сотрудник",
  "Админ",
  "Куратор",
];

const RANK_COLORS = {
  1: "#55FFFF",
  2: "#FFFF55",
  3: "#FFAA00",
  4: "#FFAA00",
  5: "#FFAA00",
  6: "#AAAAAA",
  7: "#FF5555",
  8: "#FF5555",
  9: "#FF5555",
};

const FORMAT_PRESETS = {
  nick_pipe_rank: "{nick}  |  {rank}",
  rank_bracket_nick: "[{rank}]  {nick}",
  nick_only: "{nick}",
  rank_only: "{rank}",
  nick_dash_rank: "{nick} — {rank}",
  nick_dot_rank: "{nick} • {rank}",
};

const DEFAULT_SETTINGS = {
  preset: "nick_pipe_rank",
  template: FORMAT_PRESETS.nick_pipe_rank,
  colorizeRank: true,
  nickTone: 92,
  uiTheme: "system",
  badgeOpacity: 12,
  badgeTint: "dark",
  copyNickOnClick: true,
};

let settings = { ...DEFAULT_SETTINGS };
let apiUsers = [];
let fullnameToStaff = {};
let staffStale = false;
let staffFetchedAt = 0;

function rankLabel(rank) {
  return RANKS[rank] ?? "N/A";
}

function normalizeFullname(name) {
  return name
    .trim()
    .replace(/^[''"\u2018\u2019\u0060\u00b4]+/, "")
    .replace(/[''"\u2018\u2019\u0060\u00b4]+$/, "")
    .trim();
}

function formatCacheTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString("ru-RU");
}

function resolveTemplate(cfg) {
  if (cfg.preset && cfg.preset !== "custom" && FORMAT_PRESETS[cfg.preset]) {
    return FORMAT_PRESETS[cfg.preset];
  }
  const template = (cfg.template || "").trim();
  return template || FORMAT_PRESETS.nick_pipe_rank;
}

function clampTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.nickTone;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeUiTheme(value) {
  return value === "light" || value === "dark" ? value : "system";
}

function resolveUiTheme(pref = settings.uiTheme) {
  const mode = normalizeUiTheme(pref);
  if (mode === "light" || mode === "dark") return mode;
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function nickToneColor(tone, themePref = settings.uiTheme) {
  const theme = resolveUiTheme(themePref);
  const t = clampTone(tone) / 100;
  // light UI → darker nick; dark UI → whiter nick (tone = intensity)
  const v =
    theme === "dark"
      ? Math.round(160 + t * 95)
      : Math.round(100 - t * 90);
  const hex = Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function badgeBackground(opacity, tint = settings.badgeTint) {
  const a = clampTone(opacity) / 100;
  return normalizeBadgeTint(tint) === "light"
    ? `rgba(255, 255, 255, ${a})`
    : `rgba(0, 0, 0, ${a})`;
}

function normalizeBadgeTint(value) {
  return value === "light" ? "light" : "dark";
}

function normalizeSettings(saved = {}) {
  const next = {
    ...DEFAULT_SETTINGS,
    ...saved,
    template:
      saved.template ||
      FORMAT_PRESETS[saved.preset] ||
      DEFAULT_SETTINGS.template,
    nickTone: clampTone(saved.nickTone ?? DEFAULT_SETTINGS.nickTone),
    uiTheme: normalizeUiTheme(saved.uiTheme ?? DEFAULT_SETTINGS.uiTheme),
    badgeOpacity: clampTone(
      saved.badgeOpacity ?? DEFAULT_SETTINGS.badgeOpacity,
    ),
    badgeTint: normalizeBadgeTint(
      saved.badgeTint ?? DEFAULT_SETTINGS.badgeTint,
    ),
    copyNickOnClick:
      saved.copyNickOnClick !== undefined
        ? Boolean(saved.copyNickOnClick)
        : DEFAULT_SETTINGS.copyNickOnClick,
  };
  if (saved.format && !saved.preset) {
    next.preset = saved.format;
    next.template =
      FORMAT_PRESETS[saved.format] || saved.template || next.template;
  }
  return next;
}

async function loadSettings() {
  const result = await runtime.storage.local.get(SETTINGS_KEY);
  settings = normalizeSettings(result[SETTINGS_KEY] || {});
  return settings;
}

function applyStaffData(data, meta = {}) {
  apiUsers = data;
  fullnameToStaff = {};
  apiUsers.forEach((user) => {
    fullnameToStaff[normalizeFullname(user.fullname)] = user;
  });
  staffStale = Boolean(meta.stale);
  staffFetchedAt = meta.fetchedAt || 0;
}

function applyStaffCache(persisted, stale = true) {
  if (!persisted?.data?.length) return false;
  applyStaffData(persisted.data, {
    stale,
    fetchedAt: persisted.fetchedAt || 0,
  });
  return true;
}

async function loadStaffFromStorage() {
  const result = await runtime.storage.local.get(STAFF_STORAGE_KEY);
  return applyStaffCache(result[STAFF_STORAGE_KEY], true);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || "timeout")), ms);
    }),
  ]);
}

async function loadStaffFromBackground(forceRefresh = false) {
  try {
    const response = await withTimeout(
      runtime.runtime.sendMessage({
        action: "getStaff",
        forceRefresh,
      }),
      MSG_TIMEOUT_MS,
      "background timeout",
    );
    if (response?.success && response.data) {
      applyStaffData(response.data, {
        stale: response.stale,
        fetchedAt: response.fetchedAt,
      });
      return true;
    }
    console.warn("[HolyVK] background:", response?.error || "empty");
    return false;
  } catch (err) {
    console.warn("[HolyVK] background:", err?.message || err);
    return false;
  }
}

async function reloadStaff(forceRefresh = false) {
  const fromBg = await loadStaffFromBackground(forceRefresh);
  if (!fromBg) {
    const fromCache = await loadStaffFromStorage();
    if (!fromCache) return false;
  }
  refreshAllNicks();
  return true;
}

function refreshAllNicks() {
  document.querySelectorAll(".custom-vk-nick").forEach((badge) => badge.remove());
  document.querySelectorAll(".PeerTitle").forEach(addNickToPeer);
}

function createRankSpan(label, rank, baseColor) {
  const el = document.createElement("span");
  el.className = "custom-vk-nick__rank";
  el.textContent = label;
  if (settings.colorizeRank && RANK_COLORS[rank]) {
    el.style.color = RANK_COLORS[rank];
    el.style.fontWeight = "600";
  } else {
    el.style.color = baseColor;
  }
  return el;
}

async function copyNick(nickname) {
  try {
    await navigator.clipboard.writeText(nickname);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = nickname;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function fillBadge(badge, nickname, rank) {
  const rankText = rankLabel(rank);
  const template = resolveTemplate(settings);
  const baseColor = nickToneColor(settings.nickTone);
  badge.style.color = baseColor;
  badge.style.background = badgeBackground(settings.badgeOpacity);
  badge.dataset.nickname = nickname;
  badge.replaceChildren();

  const parts = template.split(/(\{nick\}|\{rank\})/g);
  for (const part of parts) {
    if (part === "{nick}") {
      const nick = document.createElement("span");
      nick.className = "custom-vk-nick__nick";
      nick.style.color = baseColor;
      nick.textContent = nickname;
      badge.appendChild(nick);
    } else if (part === "{rank}") {
      badge.appendChild(createRankSpan(rankText, rank, baseColor));
    } else if (part) {
      const sep = document.createElement("span");
      sep.className = "custom-vk-nick__sep";
      sep.style.color = baseColor;
      sep.textContent = part;
      badge.appendChild(sep);
    }
  }
}

function addNickToPeer(peerEl) {
  if (peerEl.querySelector(".custom-vk-nick")) return;

  const titleEl = peerEl.querySelector(".PeerTitle__title");
  if (!titleEl) return;

  const fullname = titleEl.textContent.trim();
  if (!fullname) return;

  const staff = fullnameToStaff[normalizeFullname(fullname)];
  if (!staff?.nickname) return;

  const badge = document.createElement("span");
  badge.className = "custom-vk-nick";
  fillBadge(badge, staff.nickname, staff.rank);

  let title = "Должность: " + rankLabel(staff.rank);
  if (settings.copyNickOnClick) {
    badge.classList.add("custom-vk-nick--copyable");
    title += "\nКлик — скопировать ник";
  }
  if (staffStale && staffFetchedAt) {
    title += "\nКэш от " + formatCacheTime(staffFetchedAt);
  }
  badge.title = title;

  if (settings.copyNickOnClick) {
    badge.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nick = badge.dataset.nickname || staff.nickname;
      const ok = await copyNick(nick);
      if (!ok) return;
      badge.classList.add("custom-vk-nick--copied");
      const prev = badge.title;
      badge.title = "Скопировано: " + nick;
      setTimeout(() => {
        badge.classList.remove("custom-vk-nick--copied");
        badge.title = prev;
      }, 900);
    });
  }

  peerEl.appendChild(badge);
}

function initObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.(".PeerTitle")) addNickToPeer(node);
        node.querySelectorAll?.(".PeerTitle").forEach(addNickToPeer);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(".PeerTitle").forEach(addNickToPeer);
}

function isMessengerPage() {
  const host = location.hostname.replace(/^www\./, "");
  if (host === "web.vk.me" || host.endsWith(".vk.me")) return true;
  const path = location.pathname || "";
  return (
    path === "/im" ||
    path.startsWith("/im/") ||
    path.startsWith("/im?") ||
    path.includes("/mail") ||
    path.includes("/write") ||
    path.includes("/convo")
  );
}

async function init() {
  if (globalThis.__holyvkInit) return;
  if (!isMessengerPage()) return;
  globalThis.__holyvkInit = true;

  await loadSettings();
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[SETTINGS_KEY]) {
      settings = normalizeSettings(changes[SETTINGS_KEY].newValue || {});
      refreshAllNicks();
    }
    if (changes[STAFF_STORAGE_KEY]?.newValue) {
      if (applyStaffCache(changes[STAFF_STORAGE_KEY].newValue, false)) {
        refreshAllNicks();
      }
    }
  });

  const schemeMq = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  schemeMq?.addEventListener?.("change", () => {
    if (normalizeUiTheme(settings.uiTheme) === "system") refreshAllNicks();
  });

  await loadStaffFromStorage();
  setTimeout(initObserver, 1000);
  refreshAllNicks();

  void reloadStaff(true);
  setInterval(() => {
    void reloadStaff(false);
  }, STAFF_REFRESH_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
