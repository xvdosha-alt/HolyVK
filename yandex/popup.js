const runtime = globalThis.browser ?? globalThis.chrome;
const SETTINGS_KEY = "holyvk_settings";

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

const PREVIEW_POOL = [
  { nick: "ToplecCHlKA", rank: "Куратор", color: "#FF5555" },
  { nick: "Bedlam", rank: "Админ", color: "#FF5555" },
  { nick: "Derzkaya_sonya", rank: "Админ", color: "#FF5555" },
  { nick: "_3AK0_", rank: "Админ", color: "#FF5555" },
  { nick: "Traiwy", rank: "Админ", color: "#FF5555" },
  { nick: "Asya_Masya", rank: "Ст. Сотрудник", color: "#FF5555" },
  { nick: "That0neBear", rank: "Ст. Сотрудник", color: "#FF5555" },
  { nick: "HackerCat777", rank: "Ст. Сотрудник", color: "#FF5555" },
];

const PREVIEW_SAMPLE =
  PREVIEW_POOL[Math.floor(Math.random() * PREVIEW_POOL.length)];
const PREVIEW_NICK = PREVIEW_SAMPLE.nick;
const PREVIEW_RANK = PREVIEW_SAMPLE.rank;
const PREVIEW_RANK_COLOR = PREVIEW_SAMPLE.color;

function clampTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.nickTone;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeUiTheme(value) {
  return value === "light" || value === "dark" ? value : "system";
}

function normalizeBadgeTint(value) {
  return value === "light" ? "light" : "dark";
}

function resolveUiTheme(pref) {
  const mode = normalizeUiTheme(pref);
  if (mode === "light" || mode === "dark") return mode;
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function nickToneColor(tone, themePref) {
  const theme = resolveUiTheme(themePref);
  const t = clampTone(tone) / 100;
  const v =
    theme === "dark"
      ? Math.round(160 + t * 95)
      : Math.round(100 - t * 90);
  const hex = Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function badgeBackground(opacity, tint) {
  const a = clampTone(opacity) / 100;
  return normalizeBadgeTint(tint) === "light"
    ? `rgba(255, 255, 255, ${a})`
    : `rgba(0, 0, 0, ${a})`;
}

function applyPopupTheme(themePref) {
  document.body.dataset.theme = resolveUiTheme(themePref);
}

async function loadSettings() {
  const result = await runtime.storage.local.get(SETTINGS_KEY);
  const saved = result[SETTINGS_KEY] || {};
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (saved.format && !saved.preset) {
    settings.preset = saved.format;
  }
  if (!settings.template) {
    settings.template =
      FORMAT_PRESETS[settings.preset] || DEFAULT_SETTINGS.template;
  }
  settings.nickTone = clampTone(
    settings.nickTone ?? DEFAULT_SETTINGS.nickTone,
  );
  settings.uiTheme = normalizeUiTheme(
    settings.uiTheme ?? DEFAULT_SETTINGS.uiTheme,
  );
  settings.badgeOpacity = clampTone(
    settings.badgeOpacity ?? DEFAULT_SETTINGS.badgeOpacity,
  );
  settings.badgeTint = normalizeBadgeTint(
    settings.badgeTint ?? DEFAULT_SETTINGS.badgeTint,
  );
  settings.copyNickOnClick =
    settings.copyNickOnClick !== undefined
      ? Boolean(settings.copyNickOnClick)
      : DEFAULT_SETTINGS.copyNickOnClick;
  return settings;
}

async function saveSettings(settings) {
  await runtime.storage.local.set({ [SETTINGS_KEY]: settings });
}

function readForm() {
  const preset =
    document.querySelector('input[name="preset"]:checked')?.value ||
    DEFAULT_SETTINGS.preset;
  const uiTheme = normalizeUiTheme(
    document.querySelector('input[name="uiTheme"]:checked')?.value,
  );
  const badgeTint = normalizeBadgeTint(
    document.querySelector('input[name="badgeTint"]:checked')?.value,
  );
  const template = document.getElementById("template").value;
  const colorizeRank = document.getElementById("colorizeRank").checked;
  const copyNickOnClick = document.getElementById("copyNickOnClick").checked;
  const nickTone = clampTone(document.getElementById("nickTone").value);
  const badgeOpacity = clampTone(
    document.getElementById("badgeOpacity").value,
  );
  return {
    preset,
    template,
    colorizeRank,
    copyNickOnClick,
    nickTone,
    uiTheme,
    badgeOpacity,
    badgeTint,
  };
}

function renderPreview(form) {
  const badge = document.getElementById("previewBadge");
  const tpl = form.template || FORMAT_PRESETS.nick_pipe_rank;
  const baseColor = nickToneColor(form.nickTone, form.uiTheme);
  badge.replaceChildren();
  badge.style.color = baseColor;
  badge.style.background = badgeBackground(form.badgeOpacity, form.badgeTint);
  badge.classList.remove("flash");
  void badge.offsetWidth;
  badge.classList.add("flash");

  const parts = tpl.split(/(\{nick\}|\{rank\})/g);
  for (const part of parts) {
    if (part === "{nick}") {
      const nick = document.createElement("span");
      nick.style.color = baseColor;
      nick.textContent = PREVIEW_NICK;
      badge.appendChild(nick);
    } else if (part === "{rank}") {
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = PREVIEW_RANK;
      rank.style.color = form.colorizeRank ? PREVIEW_RANK_COLOR : baseColor;
      badge.appendChild(rank);
    } else if (part) {
      const sep = document.createElement("span");
      sep.style.color = baseColor;
      sep.textContent = part;
      badge.appendChild(sep);
    }
  }
}

function syncTemplateSection(preset) {
  const section = document.getElementById("templateSection");
  const templateInput = document.getElementById("template");
  const isCustom = preset === "custom";
  section.hidden = !isCustom;
  templateInput.disabled = !isCustom;
}

function applyForm(settings) {
  const preset = FORMAT_PRESETS[settings.preset] ? settings.preset : "custom";
  const radio = document.querySelector(
    `input[name="preset"][value="${preset}"]`,
  );
  if (radio) radio.checked = true;

  const themeRadio = document.querySelector(
    `input[name="uiTheme"][value="${settings.uiTheme}"]`,
  );
  if (themeRadio) themeRadio.checked = true;

  const tintRadio = document.querySelector(
    `input[name="badgeTint"][value="${settings.badgeTint}"]`,
  );
  if (tintRadio) tintRadio.checked = true;

  const templateInput = document.getElementById("template");
  templateInput.value =
    settings.template ||
    FORMAT_PRESETS[preset] ||
    DEFAULT_SETTINGS.template;
  syncTemplateSection(preset);

  document.getElementById("colorizeRank").checked = Boolean(
    settings.colorizeRank,
  );
  document.getElementById("copyNickOnClick").checked = Boolean(
    settings.copyNickOnClick,
  );

  const tone = clampTone(settings.nickTone);
  document.getElementById("nickTone").value = String(tone);
  document.getElementById("toneValue").textContent = `${tone}%`;

  const badgeOpacity = clampTone(settings.badgeOpacity);
  document.getElementById("badgeOpacity").value = String(badgeOpacity);
  document.getElementById("badgeOpacityValue").textContent =
    `${badgeOpacity}%`;

  applyPopupTheme(settings.uiTheme);
  renderPreview({
    template: templateInput.value,
    colorizeRank: settings.colorizeRank,
    nickTone: tone,
    uiTheme: settings.uiTheme,
    badgeOpacity,
    badgeTint: settings.badgeTint,
  });
}

async function persist() {
  const form = readForm();
  document.getElementById("toneValue").textContent = `${form.nickTone}%`;
  document.getElementById("badgeOpacityValue").textContent =
    `${form.badgeOpacity}%`;
  applyPopupTheme(form.uiTheme);
  await saveSettings(form);
  renderPreview(form);
}

async function init() {
  const settings = await loadSettings();
  applyForm(settings);

  document.querySelectorAll('input[name="preset"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const preset = input.value;
      const templateInput = document.getElementById("template");
      if (preset !== "custom" && FORMAT_PRESETS[preset]) {
        templateInput.value = FORMAT_PRESETS[preset];
      } else {
        templateInput.focus();
      }
      syncTemplateSection(preset);
      await persist();
    });
  });

  document.querySelectorAll('input[name="uiTheme"]').forEach((input) => {
    input.addEventListener("change", persist);
  });

  document.querySelectorAll('input[name="badgeTint"]').forEach((input) => {
    input.addEventListener("change", persist);
  });

  document.getElementById("template").addEventListener("input", async () => {
    const custom = document.querySelector(
      'input[name="preset"][value="custom"]',
    );
    if (custom && !custom.checked) {
      custom.checked = true;
      syncTemplateSection("custom");
    }
    await persist();
  });

  document.getElementById("colorizeRank").addEventListener("change", persist);
  document
    .getElementById("copyNickOnClick")
    .addEventListener("change", persist);
  document.getElementById("nickTone").addEventListener("input", persist);
  document.getElementById("badgeOpacity").addEventListener("input", persist);

  const schemeMq = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  schemeMq?.addEventListener?.("change", () => {
    const form = readForm();
    if (form.uiTheme !== "system") return;
    applyPopupTheme("system");
    renderPreview(form);
  });
}

init();
