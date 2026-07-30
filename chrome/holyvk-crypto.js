function holyvkUtf8(str) {
  return new TextEncoder().encode(str);
}

function holyvkB64UrlEncode(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function holyvkB64UrlDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function holyvkSha256(label, secret) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    holyvkUtf8(label + secret),
  );
  return new Uint8Array(digest);
}

function holyvkRandomNonce(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return holyvkB64UrlEncode(bytes);
}

async function holyvkSignStaffRequest(ts, nonce) {
  const keyRaw = await holyvkSha256("holyvk-hmac-v1:", HOLYVK_CONFIG.masterSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyRaw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const msg = holyvkUtf8(`GET\n/v1/staff\n${ts}\n${nonce}`);
  const sig = await crypto.subtle.sign("HMAC", key, msg);
  return holyvkB64UrlEncode(new Uint8Array(sig));
}

async function holyvkDecryptStaffPayload(payload) {
  if (!payload || payload.v !== 1 || !payload.iv || !payload.ct) {
    throw new Error("bad payload");
  }
  const keyRaw = await holyvkSha256("holyvk-enc-v1:", HOLYVK_CONFIG.masterSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyRaw,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const iv = holyvkB64UrlDecode(payload.iv);
  const ct = holyvkB64UrlDecode(payload.ct);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: holyvkUtf8("holyvk-staff-v1"),
    },
    key,
    ct,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(parsed.staff)) throw new Error("bad staff");
  return parsed;
}

async function holyvkFetchStaffViaProxy() {
  const base = (HOLYVK_CONFIG.proxyBase || "").replace(/\/+$/, "");
  if (!base || !HOLYVK_CONFIG.masterSecret) {
    throw new Error("proxy not configured");
  }

  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = holyvkRandomNonce(16);
  const sign = await holyvkSignStaffRequest(ts, nonce);

  const res = await fetch(`${base}/v1/staff`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-HolyVK-Ts": ts,
      "X-HolyVK-Nonce": nonce,
      "X-HolyVK-Sign": sign,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  const decrypted = await holyvkDecryptStaffPayload(payload);
  return {
    data: decrypted.staff,
    stale: false,
    fetchedAt: decrypted.fetchedAt || Date.now(),
  };
}
