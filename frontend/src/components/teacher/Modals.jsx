import React, { useState, useEffect } from 'react';
import { UserPlus, Upload, Plus, Shield, QrCode, Check, FileText, Layers, Minus, Loader2, Clock, X, Database, Search, Link } from 'lucide-react';
import { IconPicker } from '../shared/SubjectIcon';

function extractYouTubeId(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url?.match(p);
    if (m) return m[1];
  }
  return null;
}
import { Modal } from '../ui';
import { Btn, Input, Textarea, Toggle } from '../ui';
import { testApi, apiClient } from '../../lib/api';
import { useAppCache } from '../../store';

export function NewStandardModal({ open, onClose }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('graduation');
  return (
    <Modal open={open} onClose={onClose} title="New standard">
      <p className="text-sm text-neutral-600 mb-5">Create a new standard. You can add subjects to it afterwards.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <IconPicker value={emoji} onChange={setEmoji} fallback="graduation" />
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
  const standards = useAppCache(s => s.standards);
  const std = standards.find((s) => s.id === standardId);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('book');
  return (
    <Modal open={open} onClose={onClose} title={`New subject${std ? ` in ${std.name}` : ''}`}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <IconPicker value={emoji} onChange={setEmoji} />
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
  const link = `udaya-learn.com/join/${standard?.short || 'std'}-abc123`;
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
  const standards = useAppCache(s => s.standards);
  const subjects  = useAppCache(s => s.subjects);
  const [form, setForm] = useState({
    title: '', duration: 30, totalMarks: 20,
    classId: defaultClassId || '',
    schedDate: '', schedTime: '',
    negativeMarking: false, penalty: 0.25,
  });
  const [questions, setQuestions] = useState([{ question: '', options: ['', '', '', ''], correct_idx: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

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
                  <option key={c.id} value={c.id}>{c.name}</option>
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
          <Btn variant="default" size="sm" icon={Database} onClick={() => setImportOpen(true)} className="w-full mt-1">Import from Bank</Btn>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-white/60">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon={Plus} onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
          Create test
        </Btn>
      </div>
      <ImportFromBankModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onPick={(bankQuestions) => {
          setQuestions(prev => [...prev, ...bankQuestions.map(q => ({
            question: q.question,
            options: q.options,
            correct_idx: q.correct_idx,
          }))]);
          setImportOpen(false);
        }}
      />
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

function toMmSs(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseMmSs(str) {
  const parts = str.split(':');
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  return parseInt(str, 10) || 0;
}

export function EditVideoModal({ open, onClose, video, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [chapters, setChapters] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytVideoId, setYtVideoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && video) {
      setTitle(video.title || '');
      setDescription(video.description || '');
      setAllowDownload(video.allow_download !== false);
      setChapters(video.chapters ? [...video.chapters].sort((a, b) => a.start_secs - b.start_secs) : []);
      setError('');
      if (video.source_type === 'youtube' && video.cloudflare_video_id?.startsWith('yt:')) {
        const id = video.cloudflare_video_id.slice(3);
        setYtVideoId(id);
        setYoutubeUrl(`https://www.youtube.com/watch?v=${id}`);
      } else {
        setYoutubeUrl('');
        setYtVideoId(null);
      }
    }
  }, [open, video]);

  const handleAddChapter = () => {
    setChapters([...chapters, { title: '', start_secs: 0 }]);
  };

  const handleRemoveChapter = (idx) => {
    setChapters(chapters.filter((_, i) => i !== idx));
  };

  const handleChapterChange = (idx, field, value) => {
    const updated = [...chapters];
    if (field === 'time') {
      updated[idx] = { ...updated[idx], start_secs: parseMmSs(value) };
    } else if (field === 'title') {
      updated[idx] = { ...updated[idx], title: value };
    }
    setChapters(updated);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (video?.source_type === 'youtube' && youtubeUrl.trim() && !ytVideoId) {
      setError('Invalid YouTube URL'); return;
    }
    setSaving(true);
    setError('');
    try {
      const sorted = [...chapters].sort((a, b) => a.start_secs - b.start_secs);
      const payload = { title: title.trim(), description: description.trim() || null, allow_download: allowDownload, chapters: sorted };
      if (video?.source_type === 'youtube' && ytVideoId) payload.youtube_video_id = ytVideoId;
      await apiClient(`/videos/${video.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Derive the playback URL for non-YouTube (uploaded) videos
  const uploadedVideoUrl = video?.source_type !== 'youtube' && video?.cloudflare_video_id
    ? (video.cloudflare_video_id.startsWith('https://')
        ? video.cloudflare_video_id
        : `https://watch.cloudflarestream.com/${video.cloudflare_video_id}`)
    : null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Video" size="md">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">{error}</div>}
        <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} />

        {/* Show the video URL for uploaded (non-YouTube) videos */}
        {uploadedVideoUrl && (
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 flex items-center gap-1.5 block">
              <Link size={11} /> Video link
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={uploadedVideoUrl}
                className="flex-1 px-3 py-2 rounded-md bg-neutral-50 border border-neutral-200 text-xs text-neutral-500 font-mono truncate"
              />
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(uploadedVideoUrl)}
              >
                Copy
              </Btn>
            </div>
          </div>
        )}

        {video?.source_type === 'youtube' && (
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block flex items-center gap-1.5">
              <Link size={11} /> YouTube URL
            </label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={e => {
                const url = e.target.value;
                setYoutubeUrl(url);
                setYtVideoId(extractYouTubeId(url) || null);
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 outline-none text-sm focus:ring-2 focus:ring-neutral-900/20"
            />
            {ytVideoId && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
                  className="w-24 rounded object-cover"
                  style={{ aspectRatio: '16/9' }}
                  alt="thumbnail"
                />
                <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded font-medium">✓ Valid URL</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 outline-none text-sm resize-none" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} className="w-4 h-4 rounded" />
          Allow offline download
        </label>

        {/* Chapters */}
        <div className="border-t border-white/60 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Chapters</p>
            <Btn variant="ghost" size="sm" icon={Plus} onClick={handleAddChapter}>Add</Btn>
          </div>
          {chapters.length === 0 && (
            <p className="text-xs text-neutral-400 py-2">No chapters yet. Add timestamps to help students navigate.</p>
          )}
          <div className="space-y-1.5">
            {chapters.map((ch, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-[10px] text-neutral-400 font-mono w-5">{idx + 1}.</span>
                <input value={ch.title} onChange={e => handleChapterChange(idx, 'title', e.target.value)}
                  placeholder="Chapter title"
                  className="flex-1 px-2 py-1.5 rounded text-xs bg-white/50 border border-white/60 outline-none" />
                <div className="relative">
                  <Clock size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input value={toMmSs(ch.start_secs)} onChange={e => handleChapterChange(idx, 'time', e.target.value)}
                    placeholder="0:00"
                    className="w-20 pl-7 pr-2 py-1.5 rounded text-xs bg-white/50 border border-white/60 outline-none font-mono" />
                </div>
                <button onClick={() => handleRemoveChapter(idx)} className="p-1 text-neutral-400 hover:text-red-500 rounded hover:bg-red-50">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-white/60">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
          Save
        </Btn>
      </div>
    </Modal>
  );
}

export function ImportFromBankModal({ open, onClose, onPick }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      setSelected(new Set());
      setSearch('');
      try {
        const { apiClient } = await import('../../lib/api');
        const data = await apiClient('/question-bank');
        setQuestions(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = questions.filter(q => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return q.question.toLowerCase().includes(s) || (q.subject || '').toLowerCase().includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title="Import from Question Bank" size="md">
      <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-8 pr-3 py-1.5 rounded text-xs bg-white/50 border border-white/60 outline-none" />
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-neutral-400" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-neutral-500 py-4 text-center">No questions found in your bank.</p>
        ) : (
          filtered.map((q, i) => (
            <label key={q.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected.has(q.id) ? 'bg-blue-50 border-blue-300' : 'border-white/60 hover:bg-white/30'}`}>
              <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-1.5">{q.question}</p>
                <div className="flex flex-wrap gap-1">
                  {q.options.map((opt, oi) => (
                    <span key={oi} className={`text-[10px] px-1.5 py-0.5 rounded ${oi === q.correct_idx ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>
                      {opt}
                    </span>
                  ))}
                </div>
                {q.subject && <p className="text-[10px] text-neutral-400 mt-1">{q.subject}</p>}
              </div>
            </label>
          ))
        )}
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-white/60">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => {
          const picked = questions.filter(q => selected.has(q.id));
          onPick(picked);
        }} disabled={selected.size === 0}>
          Add Selected ({selected.size})
        </Btn>
      </div>
    </Modal>
  );
}
