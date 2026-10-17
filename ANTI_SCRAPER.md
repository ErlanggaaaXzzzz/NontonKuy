# Anti-Scraper NontonKuy (Multi-layer)

## Layers
1. Math challenge (selalu) + optional Cloudflare Turnstile
2. Browser fingerprint (canvas/WebGL/UA)
3. Proof-of-Work (SHA-256, difficulty dinamis)
4. Behavioral wait time
5. Short-lived session token (default 3 menit) terikat IP hash + UA + FP
6. Rate limit + progressive suspicion score + temp ban
7. Honeypot API paths

## Env
```
SHIELD_ENABLED=1
SHIELD_SECRET=...
SHIELD_TOKEN_TTL_MS=180000
SHIELD_RATE_MAX=40
SHIELD_POW_DIFFICULTY=4
TURNSTILE_SITE_KEY=  # optional
TURNSTILE_SECRET=    # optional
```

## Turnstile (opsional)
1. Buat widget di Cloudflare Turnstile
2. Isi TURNSTILE_SITE_KEY + TURNSTILE_SECRET di Vercel env
3. Tambah script Turnstile di index bila perlu:
   `https://challenges.cloudflare.com/turnstile/v0/api.js`

## Honeypot paths (auto ban score)
- /api/v1/*
- /api/anime-list
- /api/internal/dump
- /api/admin/export
- /api/graphql
