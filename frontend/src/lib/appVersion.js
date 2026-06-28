// Android in-app version check. Compares the INSTALLED native build (versionCode,
// from @capacitor/app) against the latest published version.json (served by
// GET /api/app/version, which the CI pipeline updates on every release).
//
// Web/PWA returns nothing actionable — there's no APK to update there.
import { apiClient } from './api';

// main.jsx sets this flag when running inside the Capacitor shell.
export function isNativeAndroid() {
  return typeof window !== 'undefined' && window.__UDAYA_NATIVE__ === true;
}

// Installed app info via @capacitor/app: { appVersion (versionName), appBuild (versionCode) }.
export async function getInstalled() {
  if (!isNativeAndroid()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return {
      versionName: info?.version || info?.appVersion || '',
      versionCode: parseInt(info?.build ?? info?.appBuild ?? '0', 10) || 0,
    };
  } catch {
    return null;
  }
}

// Latest published version metadata. {} before the first release.
export async function fetchLatest() {
  try {
    const d = await apiClient('/app/version');
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

// Resolve the full update state for the banner. Returns null when not applicable
// (web, no data, or already up to date / forced not required).
export async function checkForUpdate() {
  if (!isNativeAndroid()) return null;
  const [installed, latest] = await Promise.all([getInstalled(), fetchLatest()]);
  if (!installed || !latest?.versionCode) return null;
  const latestCode = parseInt(latest.versionCode, 10) || 0;
  if (latestCode <= installed.versionCode) return null; // up to date
  const minCode = parseInt(latest.minVersionCode ?? 0, 10) || 0;
  return {
    versionName: latest.versionName || '',
    versionCode: latestCode,
    apkUrl: latest.apkUrl || latest.apkLatestUrl || '',
    notes: latest.notes || '',
    // Reserved for a future forced-update mode; gentle banner ignores it today.
    required: installed.versionCode < minCode,
    installedCode: installed.versionCode,
  };
}
