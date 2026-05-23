import React, { useState, useEffect } from 'react';
import { UserPlus, Upload, Plus, Shield, QrCode, Check, FileText, Layers, Minus, Loader2 } from 'lucide-react';
import { Modal } from '../ui';
import { Btn, Input, Textarea, Toggle } from '../ui';
import { testApi } from '../../lib/api';
import { useAppCache } from '../../store';

export function NewStandardModal({ open, onClose }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📚');
  const emojis = ['📚', '📐', '⚗️', '🔬', '📖', '🎓', '✏️', '🧪', '🌍', '🎨'];
  return (
    <Modal open={open} onClose={onClose} title="New standard">
      <p className="text-sm text-neutral-600 mb-5">Create a new standard. You can add subjects to it afterwards.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {emojis.map((e) => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-md flex items-center justify-center text-lg transition-all ${emoji === e ? 'bg-neutral-900 ring-2 ring-neutral-300' : 'bg-white/30 hover:bg-white/60'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Input label="Name" placeholder="10th Standard" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function NewSubjectModal({ open, onClose, standardId }) {
  const { standards } = useAppCache();
  const std = standards.find((s) => s.id === standardId);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📐');
  const emojis = ['📐', '⚗️', '🔬', '📖', '🌍', '🎨', '🎵', '💻', '🧬', '📊'];
  return (
    <Modal open={open} onClose={onClose} title={`New subject${std ? ` in ${std.name}` : ''}`}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {emojis.map((e) => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-md flex items-center justify-center text-lg transition-all ${emoji === e ? 'bg-neutral-900 ring-2 ring-neutral-300' : 'bg-white/30 hover:bg-white/60'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Input label="Subject name" placeholder="Mathematics" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start date" type="date" />
          <Input label="End date" type="date" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function InviteModal({ open, onClose, standard }) {
  const [copied, setCopied] = useState(false);
  const link = `tutoria.app/join/${standard?.short || 'std'}-abc123`;
  return (
    <Modal open={open} onClose={onClose} title="Invite students">
      <p className="text-sm text-neutral-600 mb-2">
        Share this link or QR code. Students joining enter <strong>{standard?.name}</strong> and are auto-enrolled in all subjects.
      </p>
      <p className="text-xs text-neutral-500 mb-5">You approve each request manually.</p>
      <div className="flex justify-center mb-5">
        <div className="p-4 rounded-lg bg-white/30 border border-white/60">
          <div className="w-40 h-40 bg-white rounded relative overflow-hidden flex items-center justify-center">
            <div className="grid grid-cols-12 gap-0.5 p-2">
              {Array.from({ length: 144 }).map((_, i) => (
                <div key={i} className="aspect-square"
                  style={{ background: (Math.sin(i * 7.3) + Math.cos(i * 2.1)) > 0 ? '#0F0F0E' : 'transparent' }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-5">
        <div className="flex-1 px-3 py-2 text-xs font-mono text-neutral-700 truncate rounded-md bg-white/30 border border-white/60">{link}</div>
        <Btn variant="primary" size="sm" icon={copied ? Check : QrCode}
          onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>
      <div className="space-y-2 text-xs text-neutral-600">
        <div className="flex items-center gap-2"><Shield size={12} /> Link expires in 7 days</div>
        <div className="flex items-center gap-2"><UserPlus size={12} /> Up to 50 uses</div>
        <div className="flex items-center gap-2"><Check size={12} /> Manual approval required</div>
      </div>
    </Modal>
  );
}

export function AddStudentModal({ open, onClose, standard }) {
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '' });
  return (
    <Modal open={open} onClose={onClose} title="Add student">
      <p className="text-sm text-neutral-600 mb-5">
        Student joins <strong>{standard?.name}</strong> and is automatically enrolled in all subjects.
      </p>
      <div className="space-y-4">
        <Input label="Full name" placeholder="Aarav Sharma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <Input label="Username" placeholder="aarav.s" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Input label="Email (optional)" type="email" placeholder="aarav@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Phone (optional)" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <div className="p-3 rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-900 flex items-center gap-2">
          <Shield size={12} className="text-blue-600 flex-shrink-0" />
          A temporary password will be generated. Student will be asked to change it on first login.
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={UserPlus} onClick={onClose}>Create student</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function UploadVideoModal({ open, onClose, subjectName }) {
  return (
    <Modal open={open} onClose={onClose} title={`Upload to ${subjectName || 'subject'}`}>
      <div className="space-y-4">
        <div className="p-8 rounded-md border-2 border-dashed border-white/60 bg-white/30 text-center cursor-pointer hover:bg-white/60 hover:border-neutral-300 transition-colors">
          <Upload size={28} className="text-neutral-400 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">Drop video or click to browse</p>
          <p className="text-xs text-neutral-500">MP4, MOV up to 2 GB</p>
        </div>
        <Input label="Title" placeholder="Quadratic Equations — Introduction" />
        <Textarea label="Description" placeholder="What this video covers..." />
        <div className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked id="dl" />
          <label htmlFor="dl" className="text-neutral-700">Allow students to download for offline viewing</label>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={Upload} onClick={onClose}>Upload</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function NewTestModal({ open, onClose, defaultClassId, onSuccess }) {
  const { standards, subjects } = useAppCache();
  const [form, setForm] = useState({
    title: '', duration: 30, totalMarks: 20,
    classId: defaultClassId || '',
    schedDate: '', schedTime: '',
    negativeMarking: false, penalty: 0.25,
  });
  const [questions, setQuestions] = useState([{ question: '', options: ['', '', '', ''], correct_idx: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ title: '', duration: 30, totalMarks: 20, classId: defaultClassId || '', schedDate: '', schedTime: '', negativeMarking: false, penalty: 0.25 });
      setQuestions([{ question: '', options: ['', '', '', ''], correct_idx: 0 }]);
      setError('');
    }
  }, [open, defaultClassId]);
  const presets = [0.25, 0.33, 0.5, 1];

  const handleAddQuestion = () => {
    setQuestions([...questions, { question: '', options: ['', '', '', ''], correct_idx: 0 }]);
  };

  const handleQuestionChange = (index, field, value) => {
    const updated = [...questions];
    if (field === 'question' || field === 'correct_idx') {
      updated[index][field] = value;
    } else if (field.startsWith('option_')) {
      const optIdx = parseInt(field.split('_')[1], 10);
      updated[index].options[optIdx] = value;
    }
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.classId) { setError('Subject is required'); return; }
    
    // validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) { setError(`Question ${i+1} text is empty`); return; }
      if (q.options.some(o => !o.trim())) { setError(`Question ${i+1} has empty options`); return; }
    }

    setLoading(true);
    setError('');
    
    let scheduledFor = null;
    if (form.schedDate) {
      scheduledFor = new Date(`${form.schedDate}T${form.schedTime || '00:00'}`).toISOString();
    }

    try {
      await testApi.createTestWithQuestions({
        class_id: String(form.classId),
        title: form.title,
        duration_mins: parseInt(form.duration, 10),
        total_marks: parseFloat(form.totalMarks),
        negative_marking: form.negativeMarking,
        penalty: parseFloat(form.penalty),
        status: scheduledFor ? 'scheduled' : 'active',
        scheduled_for: scheduledFor,
        questions: questions.map((q, i) => ({
          question: q.question,
          options: q.options,
          correct_idx: parseInt(q.correct_idx, 10),
          order_num: i + 1
        }))
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New test" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
        {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}
        <Input label="Title" placeholder="Weekly Test — Algebra" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Duration (min)" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          <Input label="Total marks" type="number" value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Subject</label>
          <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 outline-none text-sm">
            <option value="">— select subject —</option>
            {standards.map((std) => (
              <optgroup key={std.id} label={std.name}>
                {subjects.filter((c) => String(c.standard_id) === String(std.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Schedule date" type="date" value={form.schedDate} onChange={(e) => setForm({ ...form, schedDate: e.target.value })} />
          <Input label="Time" type="time" value={form.schedTime} onChange={(e) => setForm({ ...form, schedTime: e.target.value })} />
        </div>
        
        <div className="p-3 rounded-md bg-white/30 border border-white/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Negative marking</p>
              <p className="text-xs text-neutral-500">Deduct marks for wrong answers</p>
            </div>
            <Toggle checked={form.negativeMarking} onChange={(v) => setForm({ ...form, negativeMarking: v })} />
          </div>
          {form.negativeMarking && (
            <div className="mt-3 pt-3 border-t border-white/60">
              <label className="text-xs font-medium text-neutral-600 mb-2 block">Penalty per wrong answer</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {presets.map((p) => (
                  <button key={p} onClick={() => setForm({ ...form, penalty: p })}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${form.penalty === p ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-white/60 hover:bg-white/40'}`}>
                    −{p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-white/60">
          <h3 className="font-medium mb-3">Questions</h3>
          {questions.map((q, idx) => (
            <div key={idx} className="p-4 mb-3 border border-white/60 rounded-lg bg-white/30 relative">
              <button onClick={() => handleRemoveQuestion(idx)} className="absolute top-2 right-2 text-neutral-400 hover:text-red-500">
                <Minus size={16} />
              </button>
              <div className="mb-3">
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Question {idx + 1}</label>
                <textarea value={q.question} onChange={(e) => handleQuestionChange(idx, 'question', e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 text-sm outline-none resize-none" placeholder="Enter question..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2 bg-white px-2 py-1.5 border border-white/60 rounded-md">
                    <input type="radio" name={`correct_${idx}`} checked={q.correct_idx === oIdx} onChange={() => handleQuestionChange(idx, 'correct_idx', oIdx)} />
                    <input type="text" value={opt} onChange={(e) => handleQuestionChange(idx, `option_${oIdx}`, e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none" placeholder={`Option ${oIdx + 1}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Btn variant="default" size="sm" icon={Plus} onClick={handleAddQuestion} className="w-full">Add Question</Btn>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-white/60">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon={Plus} onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
          Create test
        </Btn>
      </div>
    </Modal>
  );
}

export function AttachPickerModal({ open, onClose, onPick }) {
  const options = [
    { icon: FileText, label: 'PDF',   ext: 'pdf' },
    { icon: FileText, label: 'Word',  ext: 'docx' },
    { icon: Layers,   label: 'PPT',   ext: 'pptx' },
    { icon: FileText, label: 'Image', ext: 'png' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Attach file" size="sm">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o, i) => (
          <button key={i} onClick={() => { onPick({ name: `sample.${o.ext}`, size: '1.4 MB' }); onClose(); }}
            className="flex flex-col items-center gap-2 p-4 rounded-md border border-white/60 hover:bg-white/40 hover:border-neutral-300 transition-colors">
            <o.icon size={20} className="text-neutral-500" />
            <span className="text-sm font-medium">{o.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
