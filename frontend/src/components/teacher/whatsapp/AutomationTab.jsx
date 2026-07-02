import React, { useEffect, useState } from 'react';
import { Plus, Play, Trash2, Pencil, Send } from 'lucide-react';
import { Btn, Input, Textarea, Toggle, Tag, Modal, SectionHeader } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import CriteriaBuilder from './CriteriaBuilder';
import { fmtDateTime } from '../../../lib/datetime';

const EMPTY = {
  name: '', target_type: 'all', target_ids: [],
  trigger_type: 'interval', trigger_config: { every: '1 week' },
  mode: 'template', template_name: '', body_text: '', category: 'utility',
  report_format: 'none', report_period: 'weekly', criteria: [], quiet_hours: {}, active: true,
};

function fmt(dt) {
  if (!dt) return '—';
  return fmtDateTime(dt) || dt;
}

function JobModal({ open, onClose, initial, templates, groups, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(initial || EMPTY); }, [initial, open]);
  const set = (patch) => setForm({ ...form, ...patch });
  const setTrig = (patch) => setForm({ ...form, trigger_config: { ...form.trigger_config, ...patch } });
  const approved = templates.filter(t => t.status === 'approved');

  const save = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    setBusy(true);
    try {
      if (form.id) await whatsappApi.updateJob(form.id, form);
      else await whatsappApi.createJob(form);
      onSaved(); onClose();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={form.id ? 'Edit job' : 'New automatic job'} size="lg">
      <div className="space-y-3">
        <Input label="Job name" value={form.name} onChange={(e) => set({ name: e.target.value })} />

        {/* Target */}
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Send to</label>
          <select value={form.target_type} onChange={(e) => set({ target_type: e.target.value, target_ids: [] })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="all">All classes</option>
            <option value="classes">Selected classes</option>
          </select>
          {form.target_type === 'classes' && (
            <div className="flex flex-wrap gap-2 mt-2">
              {groups.map(g => {
                const on = form.target_ids.includes(g.standard_id);
                return (
                  <button key={g.standard_id}
                    onClick={() => set({ target_ids: on ? form.target_ids.filter(x => x !== g.standard_id) : [...form.target_ids, g.standard_id] })}
                    className={`text-xs px-2.5 py-1 rounded-pill border ${on ? 'bg-ink text-white border-ink' : 'border-[#EBEAE7]'}`}>
                    {g.standard_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Trigger */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Trigger</label>
            <select value={form.trigger_type} onChange={(e) => set({ trigger_type: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
              <option value="interval">Repeating interval</option>
              <option value="fixed_date">Fixed date/time</option>
              <option value="post_exam">After an exam</option>
            </select>
          </div>
          {form.trigger_type === 'interval' && (
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Every</label>
              <select value={form.trigger_config.every || '1 week'} onChange={(e) => setTrig({ every: e.target.value, days: undefined })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="1 week">1 week</option>
                <option value="1 month">1 month</option>
                <option value="1 day">1 day</option>
              </select>
            </div>
          )}
          {form.trigger_type === 'fixed_date' && (
            <Input label="At" type="datetime-local" value={form.trigger_config.at || ''}
              onChange={(e) => setTrig({ at: e.target.value })} />
          )}
          {form.trigger_type === 'post_exam' && (
            <Input label="Run at (optional)" type="datetime-local" value={form.trigger_config.at || ''}
              onChange={(e) => setTrig({ at: e.target.value })} />
          )}
        </div>

        {/* Mode */}
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Message type</label>
          <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="template">Template message</option>
            <option value="freeform">Free-form text</option>
            <option value="report">Report card (criteria-based)</option>
          </select>
        </div>

        {form.mode === 'template' && (
          <select value={form.template_name || ''} onChange={(e) => set({ template_name: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="">Select template…</option>
            {approved.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        )}
        {form.mode === 'freeform' && (
          <Textarea label="Message" rows={3} value={form.body_text || ''} onChange={(e) => set({ body_text: e.target.value })} />
        )}
        {form.mode === 'report' && (
          <>
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Report format</label>
              <select value={form.report_format} onChange={(e) => set({ report_format: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="pdf">PDF</option>
                <option value="image">Image card</option>
                <option value="text">Text summary</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Report period</label>
              <select value={form.report_period || 'overall'} onChange={(e) => set({ report_period: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="overall">Overall</option>
              </select>
            </div>
            <CriteriaBuilder value={form.criteria} onChange={(c) => set({ criteria: c })} templates={templates} />
          </>
        )}

        {/* Quiet hours */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quiet hours start (allowed from)" type="time" value={form.quiet_hours?.start || ''}
            onChange={(e) => set({ quiet_hours: { ...form.quiet_hours, start: e.target.value } })} />
          <Input label="Quiet hours end (allowed until)" type="time" value={form.quiet_hours?.end || ''}
            onChange={(e) => set({ quiet_hours: { ...form.quiet_hours, end: e.target.value } })} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-700">Active</span>
          <Toggle checked={form.active} onChange={(v) => set({ active: v })} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}>{form.id ? 'Save' : 'Create job'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function AutomationTab({ templates, groups }) {
  const [jobs, setJobs] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => { try { const r = await whatsappApi.listJobs(); setJobs(r.jobs || []); } catch { setJobs([]); } };
  useEffect(() => { load(); }, []);

  const toggle = async (id) => { await whatsappApi.toggleJob(id); load(); };
  const runNow = async (id) => {
    if (!confirm('Run this automation now and message all its recipients for real?')) return;
    try { const r = await whatsappApi.runJobNow(id); alert(`Ran job — sent ${r.sent ?? 0} message(s).`); load(); }
    catch (e) { alert(e.message); }
  };

  // Test an automation safely: send its exact message to one number (yourself)
  // before it ever goes out to parents. Reuses the /send test_to_self path.
  const testJob = async (j) => {
    const last = (() => { try { return localStorage.getItem('wa_test_phone') || ''; } catch { return ''; } })();
    const phone = (window.prompt('Send a test of this automation to which WhatsApp number?', last) || '').trim();
    if (!phone) return;
    try { localStorage.setItem('wa_test_phone', phone); } catch {}
    const base = { test_to_self: phone, category: j.category || 'utility' };
    let payload;
    if (j.mode === 'template') {
      if (!j.template_name) { alert('This automation has no template selected yet.'); return; }
      payload = { ...base, mode: 'template', template_name: j.template_name };
    } else if (j.mode === 'report') {
      const msg = (j.criteria && j.criteria[0]?.message) || j.body_text
        || 'Report card preview — the report file is built per student when this runs.';
      payload = { ...base, mode: 'freeform', body_text: msg };
    } else {
      payload = { ...base, mode: 'freeform', body_text: j.body_text || '' };
    }
    try {
      const r = await whatsappApi.send(payload);
      const res = r.results?.[0] || {};
      const ok = res.status && res.status !== 'failed' && res.status !== 'not_configured';
      const note = j.mode === 'report' ? '\n(Test shows the message wording; the report file is attached only on the real run.)' : '';
      alert(ok ? `✅ Test sent (${res.status}) to ${phone}.${note}`
               : `❌ Test failed: ${res.error || (!r.configured ? 'not connected — set up Settings first' : 'unknown error')}`);
    } catch (e) { alert(e.message); }
  };

  const remove = async (id) => { if (confirm('Delete this job?')) { await whatsappApi.deleteJob(id); load(); } };

  return (
    <div>
      <SectionHeader title="Automatic messages" count={jobs.length}
        action={<Btn size="sm" variant="primary" icon={Plus} onClick={() => { setEditing(null); setModal(true); }}>New job</Btn>} />

      <div className="space-y-2">
        {jobs.length === 0 && <p className="text-sm text-neutral-400 px-1">No automatic jobs yet.</p>}
        {jobs.map(j => (
          <div key={j.id} className="glass-panel border border-[#EBEAE7] rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm flex-1 truncate">{j.name}</span>
              <Tag color={j.active ? 'green' : 'gray'}>{j.active ? 'On' : 'Off'}</Tag>
              <Toggle checked={j.active} onChange={() => toggle(j.id)} />
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {j.target_type === 'all' ? 'All classes' : `${(j.target_ids || []).length} class(es)`}
              {' · '}{j.trigger_type}{j.trigger_type === 'interval' ? ` (${j.trigger_config?.every || ''})` : ''}
              {' · '}next: {fmt(j.next_run_at)}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Btn size="sm" icon={Send} onClick={() => testJob(j)}>Test</Btn>
              <Btn size="sm" icon={Play} onClick={() => runNow(j.id)}>Run now</Btn>
              <Btn size="sm" icon={Pencil} onClick={() => { setEditing(j); setModal(true); }}>Edit</Btn>
              <Btn size="sm" variant="danger" icon={Trash2} onClick={() => remove(j.id)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>

      <JobModal open={modal} onClose={() => setModal(false)} initial={editing}
        templates={templates} groups={groups} onSaved={load} />
    </div>
  );
}
