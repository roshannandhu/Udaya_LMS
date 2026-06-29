# Udaya Android App — Distribution & Updates

How students get the app, and how you ship new versions — **without the Play Store**.
The APK is hosted on your own Cloudflare R2 (`files.udaya-learn.com`), built and signed
automatically by GitHub Actions, and students download it from a branded page.

## How it works

```
git tag v1.1.0 && git push origin v1.1.0
        │
        ▼
GitHub Actions (.github/workflows/android-release.yml)
  builds web → cap sync → SIGNS release APK → uploads to R2:
        files.udaya-learn.com/app/udaya-1.1.0.apk
        files.udaya-learn.com/app/udaya-latest.apk
        files.udaya-learn.com/app/version.json
        │
        ▼
Students: udaya-learn.com/app  (branded download page)
Installed apps: gentle "Update available" banner → Download
```

- **Download page**: public route `/app` (also `/download`). Share `https://udaya-learn.com/app`.
- **Version source of truth**: the git tag. `versionName` = tag minus `v`; `versionCode` =
  `100 + GitHub run number` (always increasing).
- **In-app updates**: the app reads `GET /api/app/version` (proxies R2 `version.json`) and
  compares the installed `versionCode`; if a newer one exists it shows a dismissible banner.

---

## One-time setup

### 1. Create a release keystore (do this once, keep it forever)

⚠️ **Back this file up in a safe place.** If you lose it you can never publish an update
that installs over the current app — students would have to uninstall + reinstall.

```bash
keytool -genkeypair -v \
  -keystore udaya-release.keystore \
  -alias udaya \
  -keyalg RSA -keysize 2048 -validity 10000
# Set a store password and a key password when prompted (can be the same).
```

### 2. Add GitHub repo secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 udaya-release.keystore` (the whole file, one line) |
| `GOOGLE_SERVICES_JSON_BASE64` | `base64 -w0 frontend/android/app/google-services.json` — **required**, else Firebase isn't initialised and the app **crashes after login** (push registration). The file is gitignored, so CI must materialise it from this secret. |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you set |
| `ANDROID_KEY_ALIAS` | `udaya` |
| `ANDROID_KEY_PASSWORD` | the key password you set |
| `R2_ACCOUNT_ID` | Cloudflare account id (for the S3 endpoint) |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_PUBLIC_BUCKET` | your public bucket name (e.g. `udaya-public`) |
| `R2_PUBLIC_BASE_URL` | `https://files.udaya-learn.com` (no trailing slash) |

> Generate an R2 API token in Cloudflare → R2 → Manage API Tokens (Object Read & Write).
> The keystore itself is **never committed** (already gitignored).

### 3. Backend env

The backend serves `GET /api/app/version` by reading `R2_PUBLIC_BASE_URL/app/version.json`.
Make sure `R2_PUBLIC_BASE_URL` is set in `backend/.env` (it already is, for storage).

---

## Shipping a new version

That's the whole flow — no manual APK handling:

```bash
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions builds, signs, and publishes. Within a minute or two:
- `https://udaya-learn.com/app` serves the new APK.
- Open apps show the "Update available" banner on next launch.

To roll a quick fix: bump the tag (`v1.1.1`) and push it.

---

## Student instructions (what they see on /app)

1. **Download** — tap "Download for Android".
2. **Allow the install** — open the file; if Android warns, tap *Settings* → enable
   *Allow from this source* → back.
3. **Open & sign in** — tap Install → Open → log in with Student ID + password.

The "unknown sources" prompt is normal for apps outside the Play Store.

---

## Files involved

| File | Role |
|------|------|
| `.github/workflows/android-release.yml` | CI: build + sign + upload on tag push |
| `frontend/android/app/build.gradle` | release signing + tag-driven version |
| `backend/main.py` → `GET /api/app/version` | public version metadata (proxies R2) |
| `frontend/src/pages/AppDownloadPage.jsx` | branded `/app` download page |
| `frontend/src/lib/appVersion.js` | installed-vs-latest version check |
| `frontend/src/components/UpdateBanner.jsx` | gentle in-app update banner |

---

## Notes / future

- **Forced updates**: `version.json` already carries `minVersionCode` (currently `0`). To
  hard-require an update for a critical release, set it and extend `UpdateBanner` to block
  when `required` is true — no schema change needed.
- **iOS**: this flow is Android-only (sideloading isn't allowed on iOS). The page + banner
  no-op on web/iOS.
- **Trust**: students download from your own `udaya-learn.com` domain over HTTPS, signed
  with your keystore — consistent signature across updates.
