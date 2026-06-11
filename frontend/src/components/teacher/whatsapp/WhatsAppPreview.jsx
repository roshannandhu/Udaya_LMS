import React from 'react';
import { ArrowLeft, Video, Phone, MoreVertical, FileText, Image as ImageIcon, Play, CheckCheck } from 'lucide-react';
import { useSettingsStore } from '../../../store';
import { formatWhatsApp, mediaKind } from './previewText';

function Initials({ name }) {
  const i = (name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className="text-sm font-semibold text-white">{i}</span>;
}

function DocChip({ name }) {
  return (
    <div className="flex items-center gap-2 bg-[#F5F6F6] rounded-lg p-2 mb-1.5 min-w-[180px]">
      <div className="w-9 h-9 rounded bg-[#EA4335]/10 flex items-center justify-center text-[#EA4335] flex-shrink-0">
        <FileText size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-[#111B21] truncate">{name || 'report.pdf'}</p>
        <p className="text-[11px] text-[#667781]">PDF document</p>
      </div>
    </div>
  );
}

function AudioRow() {
  return (
    <div className="flex items-center gap-2 mb-1.5 w-52 max-w-full">
      <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center flex-shrink-0"><Play size={15} /></div>
      <div className="flex-1 h-1 rounded-full bg-[#CFD8DC] relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#25D366]" />
      </div>
      <span className="text-[11px] text-[#667781] flex-shrink-0">0:12</span>
    </div>
  );
}

function Bubble({ msg, time }) {
  const kind = mediaKind(msg.mediaType);
  const hasText = msg.text != null && String(msg.text).trim() !== '';
  return (
    <div className="relative max-w-[82%] bg-white rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] px-2 pt-1.5 pb-1.5 mb-2">
      {kind === 'image' && (
        msg.mediaUrl
          ? <img src={msg.mediaUrl} alt="" className="rounded-md mb-1 max-h-44 w-full object-cover" />
          : <div className="rounded-md mb-1 h-28 bg-[#CFD8DC] flex items-center justify-center text-[#667781] text-xs gap-1"><ImageIcon size={16} /> Image</div>
      )}
      {kind === 'document' && <DocChip name={msg.mediaName} />}
      {kind === 'audio' && <AudioRow />}
      {hasText && (
        <p className="text-[13.5px] leading-snug text-[#111B21] whitespace-pre-wrap break-words">
          {formatWhatsApp(msg.text)}
        </p>
      )}
      {!hasText && !kind && <p className="text-[13px] text-[#8696A0] italic">Your message preview appears here…</p>}
      <span className="block text-right text-[10px] text-[#667781] mt-0.5 flex items-center justify-end gap-0.5">
        {time}<CheckCheck size={13} className="text-[#53BDEB]" />
      </span>
    </div>
  );
}

/**
 * Faithful WhatsApp chat preview — shows what a parent receives.
 * Props:
 *  - messages: [{ text, mediaType, mediaUrl, mediaName }]  (1 = Compose/Templates, many = Reports)
 *  - footnote: optional small note under the chat
 *  - businessName / businessLogo: override the LMS branding header
 */
export default function WhatsAppPreview({ messages = [], footnote, businessName, businessLogo }) {
  const lmsName = useSettingsStore((s) => s.lmsName);
  const lmsLogo = useSettingsStore((s) => s.lmsLogo);
  const name = businessName || lmsName || 'Your Institution';
  const logo = businessLogo || lmsLogo;
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const list = messages.length ? messages : [{ text: '' }];

  return (
    <div className="rounded-2xl overflow-hidden border border-[#EBEAE7] shadow-soft w-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: '#075E54' }}>
        <ArrowLeft size={18} className="text-white/90 flex-shrink-0" />
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Initials name={name} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{name}</p>
          <p className="text-[11px] text-white/70 leading-tight">business account</p>
        </div>
        <Video size={17} className="text-white/90" />
        <Phone size={16} className="text-white/90" />
        <MoreVertical size={17} className="text-white/90" />
      </div>
      {/* Chat body */}
      <div className="px-3 py-3 min-h-[180px]" style={{ background: '#ECE5DD' }}>
        <div className="flex justify-center mb-3">
          <span className="text-[11px] text-[#54656F] bg-[#FFF6CB] rounded px-2 py-0.5 shadow-sm">Today</span>
        </div>
        {list.map((m, i) => <Bubble key={i} msg={m} time={time} />)}
      </div>
      {footnote && <p className="text-[11px] text-neutral-400 px-3 py-2 bg-white border-t border-[#F1EFEC]">{footnote}</p>}
    </div>
  );
}
