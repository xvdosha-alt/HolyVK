const runtime = globalThis.browser ?? globalThis.chrome;
const storage = runtime.storage?.local ?? chrome.storage.local;

const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_ALARM = "holyvk-refresh-staff";
const STORAGE_KEY = "holyvk_staff_cache";

let staffCache = null;

function isCacheValid() {
  return staffCache && Date.now() - staffCache.fetchedAt < CACHE_TTL_MS;
}

async function loadPersistentCache() {
  const result = await storage.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

async function savePersistentCache(data, fetchedAt) {
  await storage.set({ [STORAGE_KEY]: { data, fetchedAt } });
}

async function fetchStaff() {
  const payload = await holyvkFetchStaffViaProxy();
  const fetchedAt = payload.fetchedAt || Date.now();
  staffCache = { data: payload.data, fetchedAt };
  await savePersistentCache(payload.data, fetchedAt);
  return { data: payload.data, stale: false, fetchedAt };
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

runtime.runtime.onMessage.addListener((message) => {
  if (message.action !== "getStaff") return;

  return getStaff(Boolean(message.forceRefresh))
    .then((payload) => ({ success: true, ...payload }))
    .catch((err) => {
      console.error("API Error:", err);
      return { success: false, error: err.message };
    });
});

runtime.alarms.create(REFRESH_ALARM, { periodInMinutes: 10 });
runtime.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    fetchStaff().catch((err) => console.error("Staff refresh failed:", err));
  }
});

loadPersistentCache()
  .then((persisted) => {
    if (persisted?.data?.length) {
      staffCache = persisted;
      console.log("[HolyVK] cache", persisted.data.length);
    }
  })
  .finally(() => {
    fetchStaff()
      .then((payload) => console.log("[HolyVK] fetch", payload.data.length))
      .catch((err) => console.error("[HolyVK] fetch failed", err.message));
  });
