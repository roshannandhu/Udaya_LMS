import React, { useState } from 'react';
import { Plus, Send, Trash2, RefreshCw } from 'lucide-react';
import { Btn, Input, Textarea, Tag, Modal, SectionHeader } from '../../ui';
import { whatsappApi } from '../../../lib/api';

const STATUS_COLOR = { approved: 'green', pending: 'amber', rejected: 'red', draft: 'gray' };

const PRESETS = [
  { name: 'welcome_credentials', category: 'utility', header_type: 'none',
    body_text: 'Welcome to {{1}}! Your child {{2}} is enrolled. Student ID: {{3}}.', variables: ['Institution', 'Student name', 'Student ID'] },
  { name: 'exam_report', category: 'utility', header_type: 'document',
    body_text: 'Hello, here is the exam report for {{1}}. Score: {{2}}%. {{3}}', variables: ['Student name', 'Score', 'Note'] },
  { name: 'weekly_digest', category: 'utility', header_type: 'none',
    body_text: 'Weekly update for {{1}}: attendance {{2}}%, average score {{3}}%.', variables: ['Student name', 'Attendance', 'Average'] },
  { name: 'low_attendance', category: 'utility', header_type: 'none',
    body_text: 'Attendance alert: {{1}} is at {{2}}% this period. Please ensure regular attendance.', variables: ['Student name', 'Attendance'] },
];

export default function TemplatesTab({ templates, reload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'utility', language: 'en',
    header_type: 'none', body_text: '', variables: [] });

  const create = async (submit) => {
    if (!form.name.trim() || !form.body_text.trim()) { alert('Name and body are required'); return; }
    setBusy(true);
    try {
      await whatsappApi.createTemplate({ ...form, submit });
      setOpen(false);
      setForm({ name: '', category: 'utility', language: 'en', header_type: 'none', body_text: '', variables: [] });
      reload();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const submit = async (id) => { try { await whatsappApi.submitTemplate(id); reload(); } catch (e) { alert(e.message); } };
  const refresh = async (id) => { try { await whatsappApi.templateStatus(id); reload(); } catch (e) { alert(e.message); } };
  const remove = async (id) => { if (confirm('Delete this template?')) { await whatsappApi.deleteTemplate(id); reload(); } };

  const usePreset = (p) => setForm({ ...form, ...p, language: 'en' });

  return (
    <div>
      <SectionHeader title="Templates" count={templates.length}
        action={<Btn size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>New template</Btn>} />

      <div className="space-y-2">
        {templates.length === 0 && (
          <p className="text-sm text-neutral-400 px-1">
            No templates yet. Meta requires pre-approved templates to message parents outside a 24h session.
          </p>
        )}
        {templates.map(t => (
          <div key={t.id} className="glass-panel border border-[#EBEAE7] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm flex-1 truncate">{t.name}</span>
              <Tag color={STATUS_COLOR[t.status] || 'gray'}>{t.status}</Tag>
              <Tag color="gray">{t.category}</Tag>
            </div>
            <p className="text-xs text-neutral-500 whitespace-pre-wrap">{t.body_text}</p>
            <div className="flex gap-2 mt-2">
              {t.status === 'draft' && <Btn size="sm" icon={Send} onClick={() => submit(t.id)}>Submit for approval</Btn>}
              {t.status === 'pending' && <Btn size="sm" icon={RefreshCw} onClick={() => refresh(t.id)}>Refresh status</Btn>}
              <Btn size="sm" variant="danger" icon={Trash2} onClick={() => remove(t.id)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New template" size="lg">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-neutral-500 self-center">Presets:</span>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => usePreset(p)}
                className="text-xs px-2 py-1 rounded-pill border border-[#EBEAE7] hover:bg-[#F4F2EF]">{p.name}</button>
            ))}
          </div>
          <Input label="Name (lowercase, underscores)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="auth">Authentication</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Header / media</label>
              <select value={form.header_type} onChange={(e) => setForm({ ...form, header_type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="none">None</option>
                <option value="document">Document (PDF)</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="text">Text</option>
              </select>
            </div>
          </div>
          <Textarea label="Body (use {{1}}, {{2}} for variables)" rows={4}
            value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} />
          <Input label="Variable labels (comma-separated, optional)"
            value={(form.variables || []).join(', ')}
            onChange={(e) => setForm({ ...form, variables: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn onClick={() => create(false)} disabled={busy}>Save draft</Btn>
            <Btn variant="primary" onClick={() => create(true)} disabled={busy}>Save &amp; submit</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
