import React, { useEffect } from 'react';
import {
  X, QrCode, Send, Sparkles, History, Wand2, Pencil,
  MessagesSquare, Clock, LayoutTemplate, IndianRupee,
} from 'lucide-react';

// Plain-language "How this works" guide for the WhatsApp Center. Opened from the
// home screen; a slide-over on desktop, a full-height sheet on phones. The
// variables section renders LIVE from the backend registry, so the guide can
// never show a tag that doesn't work.

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-whatsapp-green-light text-whatsapp-green-fg text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-800">{title}</p>
        <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 mb-3">
        <span className="w-7 h-7 rounded-lg bg-whatsapp-green-light text-whatsapp-green-fg flex items-center justify-center"><Icon size={14} /></span>
        {title}
      </h3>
      <div className="space-y-3 pl-9">{children}</div>
    </section>
  );
}

export default function GuideSheet({ open, onClose, variables = [] }) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  const autoVars = variables.filter((v) => v.kind === 'auto' && !v.advanced);
  const askVars = variables.filter((v) => v.kind === 'ask');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="How WhatsApp messaging works">
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close guide" />
      <div className="relative w-full sm:max-w-md h-full bg-[#FAFAF9] shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#FAFAF9]/95 backdrop-blur border-b border-[#EBEAE7]">
          <h2 className="font-semibold text-neutral-900">How this works</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0EEEB]" aria-label="Close">
            <X size={17} className="text-neutral-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-7 pb-10">
          <Section icon={QrCode} title="1 · Connect once">
            <Step n="1" title="Scan one QR code">
              Open Settings here, then on your institute's phone: WhatsApp → Linked Devices → Link a device.
              You do this once — after that, every message sends from your own WhatsApp number, free.
            </Step>
            <Step n="2" title="Add parent numbers">
              Each student needs a parent phone number (Students page, or edit it inline when picking recipients).
              A student without a number is simply skipped — nothing fails.
            </Step>
            <Step n="3" title="Send yourself a test">
              In Settings, send a test message to your own number to confirm everything is live.
            </Step>
          </Section>

          <Section icon={Send} title="2 · Send in 3 steps">
            <Step n="1" title="Pick what to send">
              The home screen asks one question — credentials, exam results, weekly/monthly report, or an announcement.
            </Step>
            <Step n="2" title="Who → Message → Send">
              Every task walks the same three steps. The phone-style preview always shows exactly what parents will receive.
            </Step>
            <Step n="3" title="Big sends run in the background">
              Sending to a whole class keeps going even if you leave the page. Check Delivery Reports for the result.
            </Step>
          </Section>

          <Section icon={Sparkles} title="3 · Variables — the fill-in-the-blank words">
            <p className="text-xs text-neutral-500 leading-relaxed -mt-1">
              A word in curly braces is replaced per student when the message sends. Two kinds:
            </p>
            <div className="rounded-xl border border-[#EBEAE7] bg-white p-3 space-y-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-whatsapp-green-fg">
                <Wand2 size={12} /> Fills itself — different for every student
              </p>
              <div className="flex flex-wrap gap-1.5">
                {autoVars.map((v) => (
                  <span key={v.name} title={v.description}
                    className="text-[11px] px-2 py-0.5 rounded-pill bg-whatsapp-green-light/50 border border-whatsapp-green-fg/20 text-whatsapp-green-fg">
                    {'{' + v.name + '}'}
                  </span>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 pt-1.5 border-t border-[#F1EFEC]">
                <Pencil size={12} /> You type it once — the same value goes to everyone
              </p>
              <div className="flex flex-wrap gap-1.5">
                {askVars.map((v) => (
                  <span key={v.name} title={v.description}
                    className="text-[11px] px-2 py-0.5 rounded-pill bg-amber-50 border border-amber-200 text-amber-800">
                    {'{' + v.name + '}'}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Example: <span className="px-1 py-0.5 rounded bg-[#F1EFEC] font-mono text-[10px]">Hi, {'{Student Name}'} scored {'{Score}'}</span> becomes
              <span className="font-medium"> “Hi, Arjun scored 88%”</span> for Arjun's parent — automatically.
              Any other word in braces stays as plain text, and the preview shows it exactly as it will send.
            </p>
          </Section>

          <Section icon={History} title="4 · After you send">
            <div className="space-y-2 text-xs text-neutral-500 leading-relaxed">
              <p className="flex gap-2"><History size={13} className="flex-shrink-0 mt-0.5 text-neutral-400" />
                <span><span className="font-semibold text-neutral-700">Delivery Reports</span> — every message with its status
                (sent ✓, delivered ✓✓, read, failed). The trash menu clears everything, only failures, or reports older than 30 days.</span></p>
              <p className="flex gap-2"><MessagesSquare size={13} className="flex-shrink-0 mt-0.5 text-neutral-400" />
                <span><span className="font-semibold text-neutral-700">Parent Chats</span> — parents can reply; conversations appear here live. Delete one chat or clear all.</span></p>
              <p className="flex gap-2"><LayoutTemplate size={13} className="flex-shrink-0 mt-0.5 text-neutral-400" />
                <span><span className="font-semibold text-neutral-700">Saved Messages</span> — write a message once (fee reminder, holiday notice…), reuse it forever. Ready-made starters included.</span></p>
              <p className="flex gap-2"><Clock size={13} className="flex-shrink-0 mt-0.5 text-neutral-400" />
                <span><span className="font-semibold text-neutral-700">Automatic Messages</span> — weekly reports or post-exam results that send themselves on a schedule.</span></p>
              <p className="flex gap-2"><IndianRupee size={13} className="flex-shrink-0 mt-0.5 text-neutral-400" />
                <span><span className="font-semibold text-neutral-700">Cost</span> — the QR connection is free with no per-message charge. Paid rates apply only if you switch to Meta's official API in Settings.</span></p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
