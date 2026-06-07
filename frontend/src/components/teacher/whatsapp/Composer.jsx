import React, { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, Music } from 'lucide-react';
import { Input, Textarea, Tag } from '../../ui';
import { whatsappApi } from '../../../lib/api';

const CATEGORIES = [
  { id: 'utility', label: 'Utility' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'auth', label: 'Authentication' },
];

function MediaIcon({ type }) {
  if (!type) return <Paperclip size={14} />;
  if (type.startsWith('image')) return <ImageIcon size={14} />;
  if (type.startsWith('audio')) return <Music size={14} />;
  return <FileText size={14} />;
}

// Compose a message: template (with variable slots) OR free-form, plus optional
// media (PDF / image / audio). `value` is owned by the parent.
export default function Composer({ value, onChange, templates = [], freeformAllowed = false }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const set = (patch) => onChange({ ...value, ...patch });

  const approved = templates.filter(t => t.status === 'approved');
  const selectedTemplate = approved.find(t => t.name === value.template_name);
  const varCount = selectedTemplate?.variables?.length || 0;

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
      {/* Mode switch */}
      <div className="flex gap-2">
        {['template', 'freeform'].map((m) => (
          <button key={m}
            onClick={() => set({ mode: m })}
            disabled={m === 'freeform' && !freeformAllowed}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium border transition-colors ${
              value.mode === m
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-neutral-700 border-[#EBEAE7] hover:bg-[#F4F2EF]'
            } ${m === 'freeform' && !freeformAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {m === 'template' ? 'Template' : 'Free-form'}
          </button>
        ))}
        {!freeformAllowed && (
          <span className="text-[11px] text-neutral-400 self-center">
            Free-form needs an open 24h session for every recipient
          </span>
        )}
      </div>

      {value.mode === 'template' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Approved template</label>
            <select
              value={value.template_name || ''}
              onChange={(e) => set({ template_name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none focus:border-neutral-400">
              <option value="">Select a template…</option>
              {approved.map(t => <option key={t.id} value={t.name}>{t.name} ({t.category})</option>)}
            </select>
            {approved.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No approved templates yet. Create &amp; submit one in the Templates tab.
              </p>
            )}
          </div>

          {selectedTemplate && (
            <div className="text-xs bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl p-3 text-neutral-600 whitespace-pre-wrap">
              {selectedTemplate.body_text}
            </div>
          )}

          {varCount > 0 && (
            <div className="space-y-2">
              {Array.from({ length: varCount }).map((_, i) => (
                <Input key={i} label={`Variable {{${i + 1}}}`}
                  placeholder={selectedTemplate.variables[i] || `Value for {{${i + 1}}}`}
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
        <Textarea label="Message" rows={5} placeholder="Type your message to parents…"
          value={value.body_text || ''} onChange={(e) => set({ body_text: e.target.value })} />
      )}

      {/* Category */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message category (billing rate)</label>
        <div className="flex gap-2">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => set({ category: c.id })}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium border ${
                value.category === c.id ? 'bg-ink text-white border-ink' : 'bg-white text-neutral-700 border-[#EBEAE7]'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Media attach */}
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attachment (optional)</label>
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
            {uploading ? 'Uploading…' : 'Attach PDF / image / audio'}
          </button>
        )}
        <input ref={fileRef} type="file" className="hidden"
          accept="image/*,audio/*,application/pdf" onChange={handleFile} />
        {value.media_url && value.body_text && (
          <p className="text-[11px] text-neutral-400 mt-1">Sends media + text together.</p>
        )}
      </div>
    </div>
  );
}
