import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X, Sparkles } from 'lucide-react';
import { checkForUpdate } from '../lib/appVersion';

// Gentle, dismissible "update available" banner for the installed Android app.
// Shows only on native when a newer versionCode is published. Dismissal is
// remembered per target version so it never nags for the same release; a newer
// release re-shows it. No-op on web/PWA.
const DISMISS_KEY = 'udaya_update_dismissed_code';

export default function UpdateBanner() {
  const [upd, setUpd] = useState(null);

  useEffect(() => {
    let alive = true;
    checkForUpdate().then((u) => {
      if (!alive || !u) return;
      const dismissed = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10) || 0;
      if (u.versionCode > dismissed) setUpd(u);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const dismiss = () => {
    if (upd) localStorage.setItem(DISMISS_KEY, String(upd.versionCode));
    setUpd(null);
  };

  return (
    <AnimatePresence>
      {upd && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[1000] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none"
        >
          <div className="max-w-md mx-auto pointer-events-auto bg-white border border-[#EBEAE7] rounded-2xl shadow-lg p-3.5 flex items-center gap-3">
            <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#F4F2EF] flex items-center justify-center text-neutral-700">
              <Sparkles size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[14px] leading-tight">Update available</p>
              <p className="text-[12px] text-neutral-500 truncate">
                {upd.versionName ? `Version ${upd.versionName} is ready to install.` : 'A newer version is ready.'}
              </p>
            </div>
            <a
              href={upd.apkUrl || undefined}
              aria-disabled={!upd.apkUrl}
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-ink text-white px-4 py-2.5 text-[13px] font-bold hover:bg-neutral-800 transition-colors"
            >
              <Download size={15} /> Update
            </a>
            <button
              onClick={dismiss}
              aria-label="Dismiss update"
              className="flex-shrink-0 w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-neutral-400 hover:bg-[#F4F2EF] hover:text-neutral-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
