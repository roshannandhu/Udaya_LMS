import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Download, ShieldCheck, Smartphone, Settings, CheckCircle2,
  MapPin, Mail, Sparkles, ArrowRight,
} from 'lucide-react';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { apiClient } from '../lib/api';

const LOCATION_URL = 'https://share.google/M9oZS4oVP6281fzOi';
const CONTACT_EMAIL = 'udayatuitionhome@gmail.com';
// Public R2 base — the APK + version.json live here. Used as a direct fallback so
// the download works even if the backend's /api/app/version is empty/misconfigured.
const R2_BASE = 'https://files.udaya-learn.com';
const FALLBACK_APK = `${R2_BASE}/app/udaya-latest.apk`;

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.06 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }),
};

const STEPS = [
  { icon: Download, title: 'Download the app', body: 'Tap the button above. The Udaya .apk file saves to your phone.' },
  { icon: Settings, title: 'Allow the install', body: 'Open the file. If Android warns you, tap "Settings" → enable "Allow from this source", then go back.' },
  { icon: CheckCircle2, title: 'Open & sign in', body: 'Tap Install, then Open. Log in with your Student ID and password.' },
];

export default function AppDownloadPage() {
  const { lmsName, lmsLogo, applyBranding } = useSettingsStore();
  const [info, setInfo] = useState(null);

  useEffect(() => { document.title = `Get the ${lmsName || 'Udaya'} app`; }, [lmsName]);

  // Public branding (logo/name) + latest app version — both work without login.
  useEffect(() => {
    apiClient('/branding').then(applyBranding).catch(() => {});
    // Prefer the backend (same-origin), but fall back to reading version.json
    // straight from R2 so the page never gets stuck when /api/app/version is empty.
    apiClient('/app/version')
      .then(d => {
        if (d && typeof d === 'object' && d.apkUrl) { setInfo(d); return; }
        return fetch(`${R2_BASE}/app/version.json?t=${Date.now()}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null)).then(j => j && setInfo(j));
      })
      .catch(() => {
        fetch(`${R2_BASE}/app/version.json?t=${Date.now()}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null)).then(j => j && setInfo(j)).catch(() => {});
      });
  }, [applyBranding]);

  // Always have a working download target: real apkUrl if known, else the latest
  // APK on R2 directly (confirmed public). An <a download> needs no CORS.
  const apkUrl = info?.apkUrl || info?.apkLatestUrl || FALLBACK_APK;
  const size = formatSize(info?.sizeBytes);
  const name = lmsName || 'Udaya';
  const logo = lmsLogo || DEFAULT_LMS_LOGO;

  return (
    <div className="min-h-dvh bg-[#FAFAF9] text-neutral-900 flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-12 pb-10">

        {/* ── Hero (splash styling: white, centered logo, animated) ── */}
        <motion.section
          initial="hidden" animate="show"
          className="flex flex-col items-center text-center"
        >
          <motion.img
            variants={{ hidden: { opacity: 0, scale: 0.78 }, show: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 } } }}
            src={logo} alt={`${name} logo`} draggable={false}
            className="w-24 h-24 rounded-[28px] object-cover shadow-card border-[4px] border-white bg-white"
          />
          <motion.h1
            custom={1} variants={fadeUp}
            className="mt-6 text-[28px] font-extrabold tracking-tight leading-none"
          >
            {name}
          </motion.h1>
          <motion.p
            custom={2} variants={fadeUp}
            className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400"
          >
            Android App · Powered by Udaya
          </motion.p>

          {/* Primary CTA — the one and only primary action on the page */}
          <motion.a
            custom={3} variants={fadeUp}
            href={apkUrl || undefined}
            aria-disabled={!apkUrl}
            className={`mt-7 w-full inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-bold shadow-card transition-colors ${
              apkUrl
                ? 'bg-ink text-white hover:bg-neutral-800'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed pointer-events-none'
            }`}
          >
            <Download size={19} strokeWidth={2.4} />
            {apkUrl ? 'Download for Android' : 'Preparing download…'}
          </motion.a>

          <motion.div custom={4} variants={fadeUp} className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
            {info?.versionName && (
              <span className="inline-flex items-center gap-1 bg-white border border-[#EBEAE7] rounded-full px-2.5 py-1 font-semibold">
                <Sparkles size={12} /> v{info.versionName}
              </span>
            )}
            {size && <span className="text-neutral-400">{size}</span>}
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <ShieldCheck size={13} /> Official app
            </span>
          </motion.div>
        </motion.section>

        {/* ── Install guide ── */}
        <section className="mt-12">
          <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">
            How to install
          </h2>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: 0.05 * i, duration: 0.35 }}
                className="flex items-start gap-3.5 bg-white border border-[#EBEAE7] rounded-2xl p-4 shadow-card"
              >
                <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#F4F2EF] flex items-center justify-center text-neutral-700">
                  <s.icon size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-neutral-400">STEP {i + 1}</span>
                  </div>
                  <p className="font-semibold text-[15px] leading-snug">{s.title}</p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed mt-0.5">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
          <p className="text-[12px] text-neutral-400 leading-relaxed mt-3 px-1">
            The "unknown sources" warning is normal for apps installed outside the Play Store —
            it's the official {name} app, safe to install.
          </p>
        </section>

        {/* ── Trust strip ── */}
        <section className="mt-8 grid grid-cols-3 gap-2.5">
          {[
            { icon: ShieldCheck, label: 'Safe & official' },
            { icon: Smartphone, label: 'Lightweight' },
            { icon: Sparkles, label: 'Auto-updates' },
          ].map((t) => (
            <div key={t.label} className="bg-white border border-[#EBEAE7] rounded-2xl p-3 flex flex-col items-center text-center gap-1.5 shadow-card">
              <t.icon size={18} className="text-neutral-700" />
              <span className="text-[11px] font-semibold text-neutral-600 leading-tight">{t.label}</span>
            </div>
          ))}
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#EBEAE7] bg-white">
        <div className="max-w-md mx-auto px-5 py-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={LOCATION_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EBEAE7] bg-[#FAFAF9] px-4 py-3 text-[13px] font-semibold text-neutral-700 hover:bg-[#F4F2EF] transition-colors"
            >
              <MapPin size={16} /> Get directions
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EBEAE7] bg-[#FAFAF9] px-4 py-3 text-[13px] font-semibold text-neutral-700 hover:bg-[#F4F2EF] transition-colors"
            >
              <Mail size={16} /> Contact us
            </a>
          </div>
          <a href="/login" className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 transition-colors">
            Open in browser instead <ArrowRight size={14} />
          </a>
          <p className="text-center text-[11px] text-neutral-400 mt-1">© {name} · Powered by Udaya</p>
        </div>
      </footer>
    </div>
  );
}
