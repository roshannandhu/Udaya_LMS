import React, { useRef, useState } from 'react';
import { Plus, Send, Trash2, RefreshCw, Pencil, Copy, Paperclip, X, Loader2, FileText, Image as ImageIcon, Music } from 'lucide-react';
import { Btn, Input, Textarea, Tag, Modal, SectionHeader } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import WhatsAppPreview from './WhatsAppPreview';
import VariablePicker from './VariablePicker';
import { renderPreview } from './previewText';
import { TEMPLATE_LIBRARY } from './templateLibrary';

const STATUS_COLOR = { approved: 'green', pending: 'amber', rejected: 'red', failed: 'red', draft: 'gray' };
const PREVIEW_SAMPLE = { name: 'Arjun', standard_name: '10th Standard', student_code: '25UDAYA100001', username: 'arjun01' };
const BLANK = { id: null, name: '', category: 'utility', language: 'en', body_text: '',
  media_url: null, media_type: null, media_name: null };

function FileChipIcon({ type }) {
  if ((type || '').startsWith('image')) return <ImageIcon size={14} />;
  if ((type || '').startsWith('audio')) return <Music size={14} />;
  return <FileText size={14} />;
}

export default function TemplatesTab({ templates, reload, variables = [], provider = 'meta' }) {
  const isMeta = provider === 'meta';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(BLANK);
  const fileRef = useRef(null);
  const editing = !!form.id;

  const openNew = () => { setForm(BLANK); setOpen(true); };
  const openFromLibrary = (item) => {
    setForm({ ...BLANK, name: item.slug, category: item.category, body_text: item.body });
    setOpen(true);
  };
  const openEdit = (t) => {
    setForm({ id: t.id, name: t.name, category: t.category || 'utility', language: t.language || 'en',
      body_text: t.body_text || '', media_url: t.media_url || null, media_type: t.media_type || null,
      media_name: t.media_name || null });
    setOpen(true);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await whatsappApi.uploadMedia(file);
      setForm((f) => ({ ...f, media_url: res.url, media_type: res.type, media_name: res.filename }));
    } catch (err) { alert(err.message || 'Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async (submit) => {
    if (!form.name.trim() || !form.body_text.trim()) { alert('Please give it a name and a message.'); return; }
    setBusy(true);
    try {
      const payload = { name: form.name, category: form.category, language: form.language,
        body_text: form.body_text, media_url: form.media_url, media_type: form.media_type,
        media_name: form.media_name, submit };
      const res = editing ? await whatsappApi.updateTemplate(form.id, payload)
                          : await whatsappApi.createTemplate(payload);
      setOpen(false);
      setForm(BLANK);
      reload();
      if (res?.error) alert(submit ? `Saved, but submitting to WhatsApp failed:\n\n${res.error}` : res.error);
    } catch (e) {
      // Never fail silently — always surface something the teacher can act on.
      alert(e?.message || 'Could not save the message. Please try again.');
    } finally { setBusy(false); }
  };

  const submit = async (id) => {
    try { const res = await whatsappApi.submitTemplate(id); reload(); if (res?.error) alert(`Submitting failed:\n\n${res.error}`); }
    catch (e) { alert(e.message); }
  };
  const refresh = async (id) => { try { await whatsappApi.templateStatus(id); reload(); } catch (e) { alert(e.message); } };
  const remove = async (id) => { if (confirm('Delete this saved message?')) { await whatsappApi.deleteTemplate(id); reload(); } };

  const insertTag = (token) => {
    const b = form.body_text || '';
    const needSpace = b && !b.endsWith(' ') && !b.endsWith('\n');
    setForm((f) => ({ ...f, body_text: (f.body_text || '') + (needSpace ? ' ' : '') + token }));
  };

  return (
    <div className="space-y-5">
      {/* What / why */}
      <div className="glass-panel border border-[#EBEAE7] rounded-card p-4 flex items-start gap-2.5">
        <Copy size={18} className="text-whatsapp-green-fg mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Saved messages</h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            A saved message is text you save once and reuse. Variables like {'{Student Name}'} fill in
            each student’s real info automatically. Start from a ready-made one below, or build your own.
          </p>
        </div>
      </div>

      {/* Ready-made library */}
      <div>
        <SectionHeader title="Ready-made saved messages"
          action={<Btn size="sm" variant="primary" icon={Plus} onClick={openNew}>Build your own</Btn>} />
        <div className="space-y-4 mt-1">
          {TEMPLATE_LIBRARY.map((cat) => (
            <div key={cat.category}>
              <p className="text-xs font-semibold text-neutral-600 mb-1.5">
                <span className="mr-1">{cat.emoji}</span>{cat.category}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.items.map((item) => (
                  <div key={item.slug} className="glass-panel border border-[#EBEAE7] rounded-xl p-3 flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{item.title}</span>
                      <button onClick={() => openFromLibrary(item)}
                        className="text-[11px] font-medium text-whatsapp-green-fg hover:underline flex items-center gap-1 flex-shrink-0">
                        <Copy size={11} /> Use this
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-400 mb-1">{item.desc}</p>
                    <p className="text-[11px] text-neutral-500 whitespace-pre-wrap line-clamp-3">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Your saved messages */}
      <div>
        <SectionHeader title="Your saved messages" count={templates.length} />
        <div className="space-y-2">
          {templates.length === 0 && (
            <p className="text-sm text-neutral-400 px-1">
              Nothing saved yet. Tap <span className="font-medium">“Use this”</span> on any ready-made
              message above, or <button onClick={openNew} className="underline">build your own</button>.
            </p>
          )}
          {templates.map((t) => (
            <div key={t.id} className="glass-panel border border-[#EBEAE7] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm flex-1 truncate">{t.name}</span>
                {isMeta && <Tag color={STATUS_COLOR[t.status] || 'gray'}>{t.status}</Tag>}
              </div>
              <p className="text-xs text-neutral-500 whitespace-pre-wrap">{t.body_text}</p>
              {t.media_url && (
                <p className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
                  <Paperclip size={11} /> {t.media_name || 'Attached file'}
                </p>
              )}
              {isMeta && (t.status === 'failed' || t.status === 'rejected') && (
                <p className="text-[11px] text-red-600 mt-1">
                  WhatsApp didn’t approve this. Check Settings (Meta token + Business Account ID), then retry.
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                <Btn size="sm" icon={Pencil} onClick={() => openEdit(t)}>Edit</Btn>
                {isMeta && (t.status === 'draft' || t.status === 'failed' || t.status === 'rejected') &&
                  <Btn size="sm" icon={Send} onClick={() => submit(t.id)}>{t.status === 'draft' ? 'Submit for approval' : 'Retry'}</Btn>}
                {isMeta && t.status === 'pending' && <Btn size="sm" icon={RefreshCw} onClick={() => refresh(t.id)}>Refresh status</Btn>}
                <Btn size="sm" variant="danger" icon={Trash2} onClick={() => remove(t.id)}>Delete</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Builder */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit saved message' : 'Build a saved message'} size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Input label="Saved message name" placeholder="e.g. fee_reminder" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />

            <Textarea label="Message" rows={6}
              placeholder="Type your message. Tap a variable below to drop in student info."
              value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} />

            <VariablePicker variables={variables} onInsert={insertTag} />

            {/* Optional real attachment — sent with every use of this saved message */}
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attach a file (optional)</label>
              {form.media_url ? (
                <div className="flex items-center gap-2 bg-[#F7F6F4] border border-[#EBEAE7] rounded-xl px-3 py-2">
                  <FileChipIcon type={form.media_type} />
                  <span className="text-sm flex-1 truncate">{form.media_name || form.media_type}</span>
                  <button onClick={() => setForm({ ...form, media_url: null, media_type: null, media_name: null })}
                    className="text-neutral-400 hover:text-neutral-700"><X size={15} /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-sm text-neutral-700 border border-dashed border-[#D9D7D3] rounded-xl px-3 py-2.5 w-full hover:bg-[#F4F2EF]">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                  {uploading ? 'Uploading…' : 'Add a PDF, image or audio file'}
                </button>
              )}
              <p className="text-[11px] text-neutral-400 mt-1">This file goes out every time you use this saved message.</p>
              <input ref={fileRef} type="file" className="hidden"
                accept="image/*,audio/*,application/pdf" onChange={handleFile} />
            </div>

            {(
              <details className="group">
                <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-800 select-none">
                  Optional settings
                </summary>
                <div className="mt-2">
                  <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message type (affects cost)</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                    <option value="utility">Update (cheapest)</option>
                    <option value="marketing">Promotion</option>
                    <option value="auth">Login code</option>
                  </select>
                </div>
              </details>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Btn onClick={() => save(false)} disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</Btn>
              {isMeta && <Btn variant="primary" onClick={() => save(true)} disabled={busy || uploading}>Save &amp; submit</Btn>}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">What parents will see</label>
            <WhatsAppPreview
              messages={[{ text: renderPreview(form.body_text, variables, {}, PREVIEW_SAMPLE),
                mediaType: form.media_type, mediaUrl: form.media_url, mediaName: form.media_name }]}
              footnote="Live preview — variables show example values here, and fill in for real when you send." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
