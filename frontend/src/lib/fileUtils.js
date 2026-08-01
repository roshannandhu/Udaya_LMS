// Android WebView file pickers (content:// providers) often return File objects
// with no extension and an empty or compound MIME type (e.g. the full
// "application/vnd.openxmlformats-…" for office docs). The backend validates by
// extension, so derive a real one from the MIME type before uploading. The old
// inline shim did `type.split('/')[1]` which produced garbage like
// ".vnd.openxmlformats-officedocument…" or ".bin" — both rejected server-side.
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'weba',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

/**
 * Returns a filename that always carries a usable extension, for the third arg of
 * FormData.append(). Falls back to '.bin' only when the MIME type is unknown too —
 * the backend then recovers the type from the file's magic bytes.
 */
export function safeFileName(file, fallbackBase = 'file') {
  const name = file?.name || fallbackBase;
  if (name.includes('.') && !name.endsWith('.')) return name;
  const mime = (file?.type || '').split(';')[0].trim().toLowerCase();
  const ext = MIME_EXT[mime]
    || (mime.startsWith('image/') ? mime.split('/')[1] : '')
    || 'bin';
  return `${name.replace(/\.+$/, '')}.${ext}`;
}

// On Android WebView (Capacitor), `a.click()` downloads are silently blocked.
// Native path: write to cache dir → open native share sheet (Save to Files, etc.)
// Browser path: standard anchor-click download.
export async function downloadOrShare(blob, filename) {
  if (window.Capacitor?.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, files: [uri] });
    } catch (err) {
      // user dismissed the share sheet — not an error
      if (!/cancel/i.test(String(err?.message ?? err))) throw err;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
