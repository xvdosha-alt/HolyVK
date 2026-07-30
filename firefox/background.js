const runtime = globalThis.browser ?? globalThis.chrome;

const STAFF_API = "https://journal.holyworld.me/srv/api/v1/staff";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_ALARM = "holyvk-refresh-staff";

let staffCache = null;

function isCacheValid() {
  return staffCache && Date.now() - staffCache.fetchedAt < CACHE_TTL_MS;
}

function fetchStaff() {
  return fetch(STAFF_API, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      staffCache = { data, fetchedAt: Date.now() };
      return data;
    });
}

function getStaff(forceRefresh) {
  if (forceRefresh) staffCache = null;
  if (isCacheValid()) return Promise.resolve(staffCache.data);
  return fetchStaff();
}

runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "getStaff") return;

  getStaff(Boolean(message.forceRefresh))
    .then((data) => sendResponse({ success: true, data }))
    .catch((err) => {
      console.error("API Error:", err);
      sendResponse({ success: false, error: err.message });
    });

  return true;
});

runtime.alarms.create(REFRESH_ALARM, { periodInMinutes: 10 });
runtime.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    fetchStaff().catch((err) => console.error("Staff refresh failed:", err));
  }
});
