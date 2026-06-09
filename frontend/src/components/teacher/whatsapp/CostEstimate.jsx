import React from 'react';
import { Btn } from '../../ui';

// Sticky footer showing the live cost estimate (count × rate = ₹total) and the
// primary send action. Shown across Compose / Reports / Automation tabs.
export default function CostEstimate({ count, estimate, currency = 'INR', onSend,
                                      sending = false, sendLabel = 'Send', disabled = false,
                                      configured = true }) {
  const sym = currency === 'INR' ? '₹' : '';
  const amount = estimate?.amount ?? 0;
  const rate = estimate?.rate ?? 0;
  const free = amount === 0; // Evolution (self-hosted) — no per-message cost to show.

  return (
    <div className="sticky bottom-0 left-0 right-0 mt-4 -mx-4 px-4 py-3 bg-white/90 backdrop-blur border-t border-[#EBEAE7] flex items-center justify-between gap-3 z-10">
      <div className="text-sm">
        {count === 0 ? (
          <div className="text-amber-700 font-medium">Select at least one parent with a phone number</div>
        ) : (
          <>
            <div className="font-semibold text-neutral-900">
              {count} {count === 1 ? 'parent' : 'parents'}{free ? '' : ` · est. ${sym}${amount.toFixed(2)}`}
            </div>
            <div className="text-xs text-neutral-500">
              {free ? 'Ready to send' : `${count} × ${sym}${Number(rate).toFixed(2)} per message`}
              {!configured && ' · WhatsApp not connected (no real send)'}
            </div>
          </>
        )}
      </div>
      <Btn variant="primary" onClick={onSend} disabled={disabled || sending || count === 0}>
        {sending ? 'Sending…' : (free ? `${sendLabel}` : `${sendLabel} (${sym}${amount.toFixed(2)})`)}
      </Btn>
    </div>
  );
}
