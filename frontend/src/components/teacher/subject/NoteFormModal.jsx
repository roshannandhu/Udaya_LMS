import React, { useState, useEffect, useRef } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { Btn, Modal } from '../../ui';
import { notesApi } from '../../../lib/api';

export default function NoteFormModal({ open, onClose, classId, note, onSaved }) {
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [file, setFile]       = useState(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title || ''); setBody(note?.body || ''); setFile(null); setError('');
  }, [open, note]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      let fileUrl = note?.file_url || null;
      let fileType = note?.file_type || null;
      let storagePath = note?.storage_path || null;
      if (file === 'remove') {
        // User cleared the existing attachment
        fileUrl = null; fileType = null; storagePath = null;
      } else if (file) {
        const up = await notesApi.uploadFile(file, classId);
        fileUrl = up.url; fileType = up.type; storagePath = up.path;
      }
      const data = { title: title.trim(), body: body.trim() || null, file_url: fileUrl, file_type: fileType, storage_path: storagePath };
      if (note?.id) {
        await notesApi.update(note.id, data);
      } else {
        await notesApi.create({ ...data, class_id: classId });
      }
      onSaved(); onClose();
    } catch (err) { setError(err?.message || 'Failed to save note'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={note ? 'Edit note' : 'New note'} size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Title</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Note title"
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Content (optional)</label>
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} placeholder="Note content…"
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attachment (PDF / image)</label>
          {((note?.storage_path || note?.file_url) && !file) ? (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <FileText size={14}/> <span className="truncate">{(note.storage_path || note.file_url || '').split('/').pop()}</span>
              <button onClick={()=>setFile('remove')} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-500 w-full">
              <Paperclip size={14}/>{file && file !== 'remove' ? file.name : 'Choose file'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e=>setFile(e.target.files[0]||null)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Btn variant="primary" onClick={handleSave} disabled={saving||!title.trim()} className="w-full justify-center">
          {saving ? 'Saving…' : note ? 'Save changes' : 'Create note'}
        </Btn>
      </div>
    </Modal>
  );
}
