import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Search, Database, Loader2, BookOpen } from 'lucide-react';
import { Btn, Input } from '../../components/ui';
import { apiClient } from '../../lib/api';

export default function QuestionBankPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ question: '', options: ['', '', '', ''], correct_idx: 0, subject: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const formRef = useRef(null);

  const fetchQuestions = async () => {
    try {
      const data = await apiClient('/question-bank');
      setQuestions(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuestions(); }, []);

  const filtered = questions.filter(q => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return q.question.toLowerCase().includes(s) || (q.subject || '').toLowerCase().includes(s);
  });

  const handleAdd = async () => {
    if (!form.question.trim()) return;
    if (form.options.some(o => !o.trim())) return;
    setSaving(true);
    try {
      await apiClient('/question-bank', {
        method: 'POST',
        body: JSON.stringify({
          question: form.question.trim(),
          options: form.options,
          correct_idx: form.correct_idx,
          subject: form.subject.trim() || null,
        }),
      });
      setForm({ question: '', options: ['', '', '', ''], correct_idx: 0, subject: '' });
      setShowForm(false);
      await fetchQuestions();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient(`/question-bank/${id}`, { method: 'DELETE' });
      setQuestions(prev => prev.filter(q => q.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <Database size={16} className="text-neutral-500" />
          <h1 className="text-lg md:text-xl font-semibold flex-1">Question Bank</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowForm(true)}>Add Question</Btn>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search questions or subjects..."
            className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-[#EFEDEA] outline-none text-sm" />
        </div>

        {/* Add form */}
        {showForm && (
          <div ref={formRef} className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">New Question</p>
              <button onClick={() => setShowForm(false)} className="p-1 text-neutral-400 hover:text-neutral-700 rounded"><X size={14} /></button>
            </div>
            <textarea value={form.question} onChange={e => setForm({ ...form, question: e.target.value })}
              rows={2} placeholder="Enter question..."
              className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 outline-none text-sm resize-none" />
            <div className="grid grid-cols-2 gap-2">
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 bg-white px-2 py-1.5 border border-white/60 rounded-md">
                  <input type="radio" name="bank_correct" checked={form.correct_idx === i} onChange={() => setForm({ ...form, correct_idx: i })} />
                  <input type="text" value={opt} onChange={e => {
                    const opts = [...form.options]; opts[i] = e.target.value; setForm({ ...form, options: opts });
                  }} placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-transparent text-sm outline-none" />
                </div>
              ))}
            </div>
            <Input label="Subject (optional)" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Algebra" />
            <div className="flex justify-end">
              <Btn variant="primary" size="sm" icon={Plus} onClick={handleAdd} disabled={saving || !form.question.trim() || form.options.some(o => !o.trim())}>
                {saving ? 'Saving…' : 'Save to Bank'}
              </Btn>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-neutral-400" size={20} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 glass-panel border-dashed border-[#D8D6D2] rounded-xl">
            <Database size={28} className="mx-auto mb-2 text-neutral-400" />
            <p className="text-sm text-neutral-600">{search ? 'No questions match your search.' : 'Your question bank is empty.'}</p>
            {!search && <Btn variant="default" size="sm" icon={Plus} onClick={() => setShowForm(true)} className="mt-3">Add your first question</Btn>}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((q, i) => (
              <div key={q.id} className="glass-panel border-white/60 shadow-sm rounded-xl p-4 relative group">
                <div className="flex items-start gap-3">
                  <span className="text-xs text-neutral-400 font-mono mt-1">{questions.indexOf(q) + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-2">{q.question}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${oi === q.correct_idx ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-neutral-50 text-neutral-600 border border-neutral-100'}`}>
                          <span className="font-mono">{String.fromCharCode(65 + oi)}.</span>
                          <span className="truncate">{opt}</span>
                          {oi === q.correct_idx && <span className="ml-auto text-[10px] font-bold text-green-600">✓</span>}
                        </div>
                      ))}
                    </div>
                    {q.subject && (
                      <div className="flex items-center gap-1 mt-2">
                        <BookOpen size={10} className="text-neutral-400" />
                        <span className="text-[10px] text-neutral-500">{q.subject}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {deleteConfirm === q.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-600">Delete?</span>
                        <button onClick={() => handleDelete(q.id)} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600">Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 text-[10px] bg-neutral-200 rounded hover:bg-neutral-300">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(q.id)} className="p-1 text-neutral-400 hover:text-red-500 rounded hover:bg-red-50" title="Delete">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
