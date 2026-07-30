const STAFF_API = "https://journal.holyworld.me/srv/api/v1/staff";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_ALARM = "holyvk-refresh-staff";
const STORAGE_KEY = "holyvk_staff_cache";

let staffCache = null;

function isCacheValid() {
  return staffCache && Date.now() - staffCache.fetchedAt < CACHE_TTL_MS;
}

function loadPersistentCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || null);
    });
  });
}

function savePersistentCache(data, fetchedAt) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [STORAGE_KEY]: { data, fetchedAt } },
      () => resolve(),
    );
  });
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
    .then(async (data) => {
      const fetchedAt = Date.now();
      staffCache = { data, fetchedAt };
      await savePersistentCache(data, fetchedAt);
      return { data, stale: false, fetchedAt };
    });
}

async function getStaffFromPersistent() {
  const persisted = await loadPersistentCache();
  if (!persisted?.data?.length) {
    return null;
  }
  staffCache = persisted;
  return {
    data: persisted.data,
    stale: true,
    fetchedAt: persisted.fetchedAt,
  };
}

async function getStaff(forceRefresh) {
  if (forceRefresh) {
    staffCache = null;
  } else if (isCacheValid()) {
    return {
      data: staffCache.data,
      stale: false,
      fetchedAt: staffCache.fetchedAt,
    };
  }

  try {
    return await fetchStaff();
  } catch (err) {
    const persisted = await getStaffFromPersistent();
    if (persisted) {
      console.warn("HolyVK: journal unavailable, using saved staff list", err.message);
      return { ...persisted, error: err.message };
    }
    throw err;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "getStaff") return;

  getStaff(Boolean(message.forceRefresh))
    .then((payload) => sendResponse({ success: true, ...payload }))
    .catch((err) => {
      console.error("API Error:", err);
      sendResponse({ success: false, error: err.message });
    });

  return true;
});

chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    fetchStaff().catch((err) => console.error("Staff refresh failed:", err));
  }
});

loadPersistentCache().then((persisted) => {
  if (persisted?.data?.length) {
    staffCache = persisted;
  }
});
