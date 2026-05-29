/**
 * Controls Android FLAG_SECURE / iOS overlay based on user role.
 * Only has effect inside the Capacitor native app — safe to call on web (no-op).
 */
async function getPlugin() {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    return registerPlugin('SecureScreen');
  } catch {
    return null;
  }
}

export async function enableScreenSecurity() {
  const plugin = await getPlugin();
  if (plugin) await plugin.enable().catch(() => {});
}

export async function disableScreenSecurity() {
  const plugin = await getPlugin();
  if (plugin) await plugin.disable().catch(() => {});
}
