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

function nickToneColor(tone) {
  const v = Math.round((clampTone(tone) / 100) * 255);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
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
  return settings;
}

async function saveSettings(settings) {
  await runtime.storage.local.set({ [SETTINGS_KEY]: settings });
}

function readForm() {
  const preset =
    document.querySelector('input[name="preset"]:checked')?.value ||
    DEFAULT_SETTINGS.preset;
  const template = document.getElementById("template").value;
  const colorizeRank = document.getElementById("colorizeRank").checked;
  const nickTone = clampTone(document.getElementById("nickTone").value);
  return { preset, template, colorizeRank, nickTone };
}

function renderPreview(template, colorizeRank, nickTone) {
  const badge = document.getElementById("previewBadge");
  const tpl = template || FORMAT_PRESETS.nick_pipe_rank;
  const baseColor = nickToneColor(nickTone);
  badge.replaceChildren();
  badge.style.color = baseColor;
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
      rank.style.color = colorizeRank ? PREVIEW_RANK_COLOR : baseColor;
      badge.appendChild(rank);
    } else if (part) {
      const sep = document.createElement("span");
      sep.style.color = baseColor;
      sep.textContent = part;
      badge.appendChild(sep);
    }
  }
}

function applyForm(settings) {
  const preset = FORMAT_PRESETS[settings.preset] ? settings.preset : "custom";
  const radio = document.querySelector(
    `input[name="preset"][value="${preset}"]`,
  );
  if (radio) radio.checked = true;

  const templateInput = document.getElementById("template");
  templateInput.value =
    settings.template ||
    FORMAT_PRESETS[preset] ||
    DEFAULT_SETTINGS.template;
  templateInput.disabled = preset !== "custom";

  document.getElementById("colorizeRank").checked = Boolean(
    settings.colorizeRank,
  );

  const tone = clampTone(settings.nickTone);
  document.getElementById("nickTone").value = String(tone);
  document.getElementById("toneValue").textContent = `${tone}%`;

  renderPreview(templateInput.value, settings.colorizeRank, tone);
}

async function persist() {
  const form = readForm();
  document.getElementById("toneValue").textContent = `${form.nickTone}%`;
  await saveSettings(form);
  renderPreview(form.template, form.colorizeRank, form.nickTone);
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
        templateInput.disabled = true;
      } else {
        templateInput.disabled = false;
        templateInput.focus();
      }
      await persist();
    });
  });

  document.getElementById("template").addEventListener("input", async () => {
    const custom = document.querySelector(
      'input[name="preset"][value="custom"]',
    );
    if (custom && !custom.checked) {
      custom.checked = true;
      document.getElementById("template").disabled = false;
    }
    await persist();
  });

  document.getElementById("colorizeRank").addEventListener("change", persist);
  document.getElementById("nickTone").addEventListener("input", persist);
}

init();
