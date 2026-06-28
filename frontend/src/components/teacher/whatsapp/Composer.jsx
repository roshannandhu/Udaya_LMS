import React, { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, Music, Type, Loader2 } from 'lucide-react';
import { Textarea } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import VariablePicker from './VariablePicker';

const CATEGORIES = [
  { id: 'utility',   label: 'Update',     hint: 'Account & report updates — cheapest' },
  { id: 'marketing', label: 'Promotion',  hint: 'Offers & announcements' },
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

function currentMsgType(value, pendingType) {
  if (pendingType) return pendingType;
  if (!value.media_type) return 'text';
  if (value.media_type.startsWith('image')) return 'image';
  if (value.media_type.startsWith('audio')) return 'audio';
  return 'pdf';
}

// Find the "ask" variables used in a body — ones the teacher must type a value for
// before sending. A {tag} that matches an auto variable fills itself; anything else
// (a known "ask" tag, or a custom word) becomes a labelled input.
export function findAskVars(body = '', registry = []) {
  const byName = {};
  (registry || []).forEach((v) => { byName[String(v.name).toLowerCase()] = v; });
  const b = String(body || '').replace(/\{\{/g, '{').replace(/\}\}/g, '}');
  const out = [];
  const seen = new Set();
  let m;
  const re = /\{([^{}]+)\}/g;
  while ((m = re.exec(b)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    const v = byName[key];
    if (v && v.kind === 'auto') continue; // fills itself
    seen.add(key);
    out.push({ name, example: v?.example || '' });
  }
  return out;
}

// Compose a message: a saved template OR your own words, plus optional media.
// One variable format ({Named Tags}); auto tags fill themselves, "ask" tags get a
// small input below. `value` is owned by the parent.
export default function Composer({ value, onChange, templates = [], onGoToTemplates,
                                   provider = 'meta', selectedCount = 0, variables = [] }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAccept, setPendingAccept] = useState(null);
  const [pendingType, setPendingType] = useState(null);
  const set = (patch) => onChange({ ...value, ...patch });

  const isMeta = provider === 'meta';
  // On Meta, only Meta-approved templates can reach parents; elsewhere every saved
  // template is usable straight away.
  const usable = isMeta ? templates.filter((t) => t.status === 'approved') : templates;
  const selectedTemplate = usable.find((t) => t.name === value.template_name);

  // "Write your own" only needs a guard on Meta (it can't free-message many parents).
  const forceTemplate = isMeta && selectedCount > 1;
  const mode = forceTemplate ? 'template' : (value.mode || 'template');

  const msgType = currentMsgType(value, pendingType);

  // Body the message is built from → drives the "fill in the blanks" inputs + preview.
  const activeBody = mode === 'template' ? (selectedTemplate?.body_text || '') : (value.body_text || '');
  const askVars = findAskVars(activeBody, variables);

  const setManual = (name, v) => set({ manual_values: { ...(value.manual_values || {}), [name]: v } });
  const insertTag = (token) => {
    const body = value.body_text || '';
    const needSpace = body && !body.endsWith(' ') && !body.endsWith('\n');
    set({ body_text: body + (needSpace ? ' ' : '') + token });
  };

  const pickType = (t) => {
    if (t.id === 'text') {
      set({ media_url: null, media_type: null, media_name: null });
      setPendingType(null);
      return;
    }
    setPendingType(t.id);
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
      setPendingType(null);
    } catch (err) {
      alert(err.message || 'Upload failed');
      setPendingType(null);
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
                         : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'}`}
                disabled={uploading}>
                {active && uploading ? <Loader2 size={14} className="animate-spin" /> : <t.icon size={14} />} {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-neutral-400 mt-1">Pick a type to attach a file, or just type a text message below.</p>
      </div>

      {/* Mode switch (template vs your own words) */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">How do you want to write it?</label>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => set({ mode: 'template' })}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium border transition-colors ${
              mode === 'template' ? 'bg-ink text-white border-ink'
                : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'}`}>
            Use a saved template
          </button>
          <button onClick={() => { if (!forceTemplate) set({ mode: 'freeform' }); }}
            disabled={forceTemplate}
            title={forceTemplate ? 'Available when messaging a single parent' : ''}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium border transition-colors ${
              mode === 'freeform' ? 'bg-ink text-white border-ink'
                : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'} ${
              forceTemplate ? 'opacity-50 cursor-not-allowed' : ''}`}>
            Write your own
          </button>
        </div>
        {isMeta && (
          <p className="text-[11px] text-neutral-400 mt-1">
            {mode === 'template'
              ? (forceTemplate ? 'Multiple parents selected — a saved template is required on WhatsApp Cloud.'
                               : 'Templates are pre-approved by WhatsApp, so they reach everyone.')
              : 'Heads-up: your own words only reach a parent who messaged you in the last 24 hours.'}
          </p>
        )}
      </div>

      {mode === 'template' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Choose a template</label>
            <select value={value.template_name || ''}
              onChange={(e) => {
                const tmpl = usable.find((t) => t.name === e.target.value);
                // Auto-attach the template's own file (if it has one).
                set({ template_name: e.target.value, category: tmpl?.category || 'utility',
                  media_url: tmpl?.media_url || null, media_type: tmpl?.media_type || null,
                  media_name: tmpl?.media_name || null });
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none focus:border-neutral-400">
              <option value="">Select a template…</option>
              {usable.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            {usable.length === 0 && (
              <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
                No saved templates yet.{' '}
                {onGoToTemplates
                  ? <button onClick={onGoToTemplates} className="underline font-medium">Create one in Templates →</button>
                  : 'Create one in the Templates tab.'}
                {' '}Or switch to <span className="font-medium">“Write your own”</span>.
              </div>
            )}
          </div>

          {selectedTemplate && (
            <div className="text-xs bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl p-3 text-neutral-600 whitespace-pre-wrap">
              {selectedTemplate.body_text}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <Textarea label="Your message" rows={5} placeholder="Type your message to parents…"
            value={value.body_text || ''} onChange={(e) => set({ body_text: e.target.value })} />
          <VariablePicker variables={variables} onInsert={insertTag} />

          {/* Cost categories only matter for the paid Meta provider — hidden on the free QR path. */}
          {isMeta && (
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message type (affects cost)</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => set({ category: c.id })} title={c.hint}
                    className={`px-3 py-1.5 rounded-pill text-xs font-medium border ${
                      value.category === c.id ? 'bg-ink text-white border-ink' : 'bg-white text-neutral-700 border-[#EBEAE7]'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                {CATEGORIES.find((c) => c.id === value.category)?.hint || CATEGORIES[0].hint}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fill in the blanks — only the variables that can't fill themselves */}
      {askVars.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-[11px] font-medium text-amber-800 mb-2">
            Fill in these blanks before sending — the same value goes to every parent:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {askVars.map((v) => (
              <div key={v.name} className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-neutral-600">{v.name}</label>
                <input
                  value={(value.manual_values || {})[v.name] || ''}
                  onChange={(e) => setManual(v.name, e.target.value)}
                  placeholder={v.example ? `e.g. ${v.example}` : v.name}
                  className="px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none focus:border-neutral-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media attach (shown when a non-text type is active, or a file is attached) */}
      {(msgType !== 'text' || value.media_url) && (
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attachment</label>
          {value.media_url ? (
            <div className="flex items-center gap-2 bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl px-3 py-2">
              <MediaIcon type={value.media_type} />
              <span className="text-sm flex-1 truncate">{value.media_name || value.media_type}</span>
              <button onClick={() => { set({ media_url: null, media_type: null, media_name: null }); setPendingType(null); }}
                className="text-neutral-400 hover:text-neutral-700"><X size={15} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 text-sm text-neutral-700 border border-dashed border-[#D9D7D3] rounded-xl px-3 py-2.5 w-full hover:bg-[#F4F2EF]">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
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
