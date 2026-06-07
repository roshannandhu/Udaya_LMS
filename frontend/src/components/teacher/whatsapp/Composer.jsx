import React, { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, Music, Type } from 'lucide-react';
import { Input, Textarea } from '../../ui';
import { whatsappApi } from '../../../lib/api';

const CATEGORIES = [
  { id: 'utility',   label: 'Utility',   hint: 'Account & report updates — cheapest' },
  { id: 'marketing', label: 'Marketing', hint: 'Promotions & announcements' },
  { id: 'auth',      label: 'Login code', hint: 'One-time passwords' },
];

// Message-type chips → what kind of attachment (if any) the message carries.
const MSG_TYPES = [
  { id: 'text',  label: 'Text',  icon: Type,      accept: null },
  { id: 'image', label: 'Image', icon: ImageIcon, accept: 'image/*' },
  { id: 'pdf',   label: 'PDF',   icon: FileText,  accept: 'application/pdf' },
  { id: 'audio', label: 'Audio', icon: Music,     accept: 'audio/*' },
];

function MediaIcon({ type }) {
  if (!type) return <Paperclip size={14} />;
  if (type.startsWith('image')) return <ImageIcon size={14} />;
  if (type.startsWith('audio')) return <Music size={14} />;
  return <FileText size={14} />;
}

function currentMsgType(value) {
  if (!value.media_type) return 'text';
  if (value.media_type.startsWith('image')) return 'image';
  if (value.media_type.startsWith('audio')) return 'audio';
  return 'pdf';
}

// Compose a message: template (with variable slots) OR free-form, plus optional
// media (PDF / image / audio). `value` is owned by the parent. Free-form is always
// available (with a 24h-window note); no more silent dead-end.
export default function Composer({ value, onChange, templates = [], onGoToTemplates }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAccept, setPendingAccept] = useState(null);
  const set = (patch) => onChange({ ...value, ...patch });

  const approved = templates.filter(t => t.status === 'approved');
  const selectedTemplate = approved.find(t => t.name === value.template_name);
  const varCount = selectedTemplate?.variables?.length || 0;
  const msgType = currentMsgType(value);

  const pickType = (t) => {
    if (t.id === 'text') {
      set({ media_url: null, media_type: null, media_name: null });
      return;
    }
    // open the file picker filtered to this type
    setPendingAccept(t.accept);
    setTimeout(() => fileRef.current?.click(), 0);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await whatsappApi.uploadMedia(file);
      set({ media_url: res.url, media_type: res.type, media_name: res.filename });
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Message type chips */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">What are you sending?</label>
        <div className="flex flex-wrap gap-2">
          {MSG_TYPES.map((t) => {
            const active = msgType === t.id;
            return (
              <button key={t.id} onClick={() => pickType(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium border transition-colors ${
                  active ? 'bg-whatsapp-green-light text-whatsapp-green-fg border-whatsapp-green-fg/30'
                         : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'}`}>
                <t.icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-neutral-400 mt-1">Pick a type to attach a file, or just type a text message below.</p>
      </div>

      {/* Mode switch (template vs free-form) */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message wording</label>
        <div className="flex flex-wrap items-center gap-2">
          {['template', 'freeform'].map((m) => (
            <button key={m}
              onClick={() => set({ mode: m })}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium border transition-colors ${
                value.mode === m
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'
              }`}>
              {m === 'template' ? 'Use a ready template' : 'Write your own message'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 mt-1">
          {value.mode === 'template'
            ? 'Templates are pre-approved by WhatsApp — the way to reach parents who haven’t messaged you recently.'
            : 'Heads-up: a message you type yourself only reaches parents who messaged you in the last 24 hours. For everyone else, use a ready template.'}
        </p>
      </div>

      {value.mode === 'template' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Choose a template</label>
            <select
              value={value.template_name || ''}
              onChange={(e) => set({ template_name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none focus:border-neutral-400">
              <option value="">Select a template…</option>
              {approved.map(t => <option key={t.id} value={t.name}>{t.name} ({t.category})</option>)}
            </select>
            {approved.length === 0 && (
              <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
                No ready templates yet. {onGoToTemplates
                  ? <button onClick={onGoToTemplates} className="underline font-medium">Create one in Templates →</button>
                  : 'Create one in the Templates tab.'}
                {' '}Or switch to <span className="font-medium">“Write your own message”</span> for parents who messaged you in the last 24h.
              </div>
            )}
          </div>

          {selectedTemplate && (
            <div className="text-xs bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl p-3 text-neutral-600 whitespace-pre-wrap">
              {selectedTemplate.body_text}
            </div>
          )}

          {varCount > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-neutral-500">Fill in the blanks — these change per parent:</p>
              {Array.from({ length: varCount }).map((_, i) => (
                <Input key={i} label={selectedTemplate.variables[i] || `Value for blank ${i + 1}`}
                  placeholder={selectedTemplate.variables[i] || `Value for blank ${i + 1}`}
                  value={(value.variables || [])[i] || ''}
                  onChange={(e) => {
                    const vars = [...(value.variables || [])];
                    vars[i] = e.target.value;
                    set({ variables: vars });
                  }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Textarea label="Your message" rows={5} placeholder="Type your message to parents…"
          value={value.body_text || ''} onChange={(e) => set({ body_text: e.target.value })} />
      )}

      {/* Category */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message type (affects cost)</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => set({ category: c.id })} title={c.hint}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium border ${
                value.category === c.id ? 'bg-ink text-white border-ink' : 'bg-white text-neutral-700 border-[#EBEAE7]'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 mt-1">
          {CATEGORIES.find(c => c.id === value.category)?.hint || CATEGORIES[0].hint}
        </p>
      </div>

      {/* Media attach (shown when a non-text type is active, or a file is attached) */}
      {(msgType !== 'text' || value.media_url) && (
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attachment</label>
          {value.media_url ? (
            <div className="flex items-center gap-2 bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl px-3 py-2">
              <MediaIcon type={value.media_type} />
              <span className="text-sm flex-1 truncate">{value.media_name || value.media_type}</span>
              <button onClick={() => set({ media_url: null, media_type: null, media_name: null })}
                className="text-neutral-400 hover:text-neutral-700"><X size={15} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 text-sm text-neutral-700 border border-dashed border-[#D9D7D3] rounded-xl px-3 py-2.5 w-full hover:bg-[#F4F2EF]">
              <Paperclip size={15} />
              {uploading ? 'Uploading…' : 'Choose a file'}
            </button>
          )}
          {value.media_url && value.body_text && (
            <p className="text-[11px] text-neutral-400 mt-1">Parents get the file and the text together.</p>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden"
        accept={pendingAccept || 'image/*,audio/*,application/pdf'} onChange={handleFile} />
    </div>
  );
}
