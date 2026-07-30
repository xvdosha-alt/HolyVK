const runtime = globalThis.browser ?? globalThis.chrome;
const STAFF_REFRESH_MS = 10 * 60 * 1000;

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

let apiUsers = [];
let fullnameToNick = {};

function loadStaffFromBackground(forceRefresh = false) {
  return new Promise((resolve) => {
    runtime.runtime.sendMessage(
      { action: "getStaff", forceRefresh },
      (response) => {
        if (response?.success && response.data) {
          apiUsers = response.data;
          fullnameToNick = {};
          apiUsers.forEach((user) => {
            fullnameToNick[normalizeFullname(user.fullname)] = user.nickname;
          });
          resolve();
        } else {
          console.error("❌ Ошибка API:", response?.error);
          resolve();
        }
      },
    );
  });
}

function refreshAllNicks() {
  document.querySelectorAll(".custom-vk-nick").forEach((badge) => badge.remove());
  document.querySelectorAll(".PeerTitle").forEach(addNickToPeer);
}

async function reloadStaff(forceRefresh = false) {
  await loadStaffFromBackground(forceRefresh);
  refreshAllNicks();
}

function addNickToPeer(peerEl) {
  if (peerEl.querySelector(".custom-vk-nick")) return;

  const titleEl = peerEl.querySelector(".PeerTitle__title");
  if (!titleEl) {
    console.log("❌ Нет .PeerTitle__title");
    return;
  }

  const fullname = titleEl.textContent.trim();
  if (!fullname) return;

  const nickname = fullnameToNick[normalizeFullname(fullname)];
  if (!nickname) {
    console.log("❌ Ник не найден в API");
    return;
  }

  const badge = document.createElement("span");
  badge.className = "custom-vk-nick";
  badge.textContent = nickname;

  const staff = apiUsers.find(
    (u) => normalizeFullname(u.fullname) === normalizeFullname(fullname),
  );
  badge.title = "Должность: " + rankLabel(staff?.rank);

  peerEl.appendChild(badge);
}

function initObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (node.matches?.(".PeerTitle")) {
          addNickToPeer(node);
        }
        node.querySelectorAll?.(".PeerTitle").forEach(addNickToPeer);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll(".PeerTitle").forEach(addNickToPeer);
}

async function init() {
  await reloadStaff(true);
  setTimeout(initObserver, 2000);
  setInterval(() => reloadStaff(false), STAFF_REFRESH_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
