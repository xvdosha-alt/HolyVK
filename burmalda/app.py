from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Any

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    master_secret: str
    journal_url: str = "https://journal.holyworld.me/srv/api/v1/staff"
    journal_api_key: str = ""
    journal_auth_header: str = "x-token"
    journal_auth_prefix: str = ""
    cache_ttl_sec: int = 300
    request_skew_sec: int = 60
    rate_limit_per_min: int = 12
    rate_limit_burst: int = 4
    listen_host: str = "127.0.0.1"
    listen_port: int = 8787

    class Config:
        env_file = ".env"
        env_prefix = "HOLYVK_"


settings = Settings()


def derive_keys(master: str) -> tuple[bytes, bytes]:
    raw = master.encode("utf-8")
    hmac_key = hashlib.sha256(b"holyvk-hmac-v1:" + raw).digest()
    enc_key = hashlib.sha256(b"holyvk-enc-v1:" + raw).digest()
    return hmac_key, enc_key


HMAC_KEY, ENC_KEY = derive_keys(settings.master_secret)


@dataclass
class CacheEntry:
    payload: bytes
    fetched_at: float


staff_cache: CacheEntry | None = None
staff_lock = Lock()

# nonce anti-replay (short lived)
used_nonces: dict[str, float] = {}
nonce_lock = Lock()

# rate limit: IP -> timestamps
hits: dict[str, deque[float]] = defaultdict(deque)
hits_lock = Lock()


def b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64d(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(ip: str) -> None:
    now = time.time()
    window = 60.0
    with hits_lock:
        q = hits[ip]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= settings.rate_limit_per_min:
            raise HTTPException(status_code=429, detail="rate limit")
        # soft burst: more than burst in 10s
        recent = sum(1 for t in q if now - t < 10)
        if recent >= settings.rate_limit_burst:
            raise HTTPException(status_code=429, detail="burst limit")
        q.append(now)


def purge_nonces(now: float) -> None:
    expired = [n for n, ts in used_nonces.items() if now - ts > settings.request_skew_sec * 2]
    for n in expired:
        del used_nonces[n]


def verify_request(ts: str, nonce: str, signature: str, path: str) -> None:
    try:
        ts_i = int(ts)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="bad ts") from exc

    now = int(time.time())
    if abs(now - ts_i) > settings.request_skew_sec:
        raise HTTPException(status_code=401, detail="ts expired")

    if not nonce or len(nonce) < 8 or len(nonce) > 64:
        raise HTTPException(status_code=401, detail="bad nonce")

    with nonce_lock:
        purge_nonces(time.time())
        if nonce in used_nonces:
            raise HTTPException(status_code=401, detail="replay")
        used_nonces[nonce] = time.time()

    msg = f"GET\n{path}\n{ts}\n{nonce}".encode("utf-8")
    expected = hmac.new(HMAC_KEY, msg, hashlib.sha256).digest()
    try:
        got = b64d(signature)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="bad sign") from exc

    if not hmac.compare_digest(expected, got):
        raise HTTPException(status_code=401, detail="bad sign")


def encrypt_staff(data: list[Any], fetched_at: float) -> dict[str, str | int]:
    body = json.dumps(
        {"staff": data, "fetchedAt": int(fetched_at * 1000)},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    iv = secrets.token_bytes(12)
    aes = AESGCM(ENC_KEY)
    packed = aes.encrypt(iv, body, b"holyvk-staff-v1")
    # packed = ciphertext || tag(16)
    return {
        "v": 1,
        "iv": b64e(iv),
        "ct": b64e(packed),
    }


async def fetch_journal() -> tuple[list[Any], float]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if settings.journal_api_key:
        headers[settings.journal_auth_header] = (
            f"{settings.journal_auth_prefix}{settings.journal_api_key}"
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.get(settings.journal_url, headers=headers)
        if res.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"journal HTTP {res.status_code}")
        data = res.json()
        if not isinstance(data, list):
            raise HTTPException(status_code=502, detail="journal shape")
        return data, time.time()


async def get_staff_cached() -> CacheEntry:
    global staff_cache
    now = time.time()
    with staff_lock:
        if staff_cache and now - staff_cache.fetched_at < settings.cache_ttl_sec:
            return staff_cache

    data, fetched_at = await fetch_journal()
    encrypted = encrypt_staff(data, fetched_at)
    payload = json.dumps(encrypted, separators=(",", ":")).encode("utf-8")
    entry = CacheEntry(payload=payload, fetched_at=fetched_at)
    with staff_lock:
        staff_cache = entry
    return entry


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"ok": "1"}


@app.get("/v1/staff")
async def staff(
    request: Request,
    x_holyvk_ts: str | None = Header(default=None, alias="X-HolyVK-Ts"),
    x_holyvk_nonce: str | None = Header(default=None, alias="X-HolyVK-Nonce"),
    x_holyvk_sign: str | None = Header(default=None, alias="X-HolyVK-Sign"),
) -> Response:
    check_rate_limit(client_ip(request))

    if not x_holyvk_ts or not x_holyvk_nonce or not x_holyvk_sign:
        raise HTTPException(status_code=401, detail="missing auth")

    verify_request(x_holyvk_ts, x_holyvk_nonce, x_holyvk_sign, "/v1/staff")

    try:
        entry = await get_staff_cached()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="upstream") from exc

    return Response(
        content=entry.payload,
        media_type="application/json",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.listen_host,
        port=settings.listen_port,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
