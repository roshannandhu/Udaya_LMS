import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, X, Upload, Loader2 } from 'lucide-react';
import { Modal, Btn, Input, Textarea } from '../ui';
import { assignmentApi } from '../../lib/api';
import { safeFileName } from '../../lib/fileUtils';

export default function NewAssignmentModal({ open, onClose, classId, editAssignment, onSuccess }) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const fileInputRef = useRef(null);

  const isEdit = !!editAssignment;

  useEffect(() => {
    if (open) {
      if (editAssignment) {
        setTitle(editAssignment.title || '');
        setDescription(editAssignment.description || '');
        setDueDate(editAssignment.due_date
          ? new Date(editAssignment.due_date).toISOString().slice(0, 16)
          : '');
        setExistingAttachments(editAssignment.assignment_attachments || []);
      } else {
        setTitle('');
        setDescription('');
        setDueDate('');
        setExistingAttachments([]);
      }
      setSelectedFiles([]);
      setSaving(false);
      setError('');
    }
  }, [open, editAssignment]);

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeSelectedFile = (idx) =>
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));

  const removeExistingAttachment = async (att) => {
    try {
      await assignmentApi.deleteAttachment(editAssignment.id, att.id);
      setExistingAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err) {
      setError(err.message || 'Failed to remove file');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await assignmentApi.update(editAssignment.id, {
          title: title.trim(),
          description: description.trim(),
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        });
        if (selectedFiles.length > 0) {
          const fd = new FormData();
          selectedFiles.forEach(f => {
            fd.append('files', f, safeFileName(f, 'attachment'));
          });
          await assignmentApi.addAttachments(editAssignment.id, fd);
        }
      } else {
        const fd = new FormData();
        fd.append('class_id', classId);
        fd.append('title', title.trim());
        fd.append('description', description.trim());
        if (dueDate) fd.append('due_date', new Date(dueDate).toISOString());
        selectedFiles.forEach(f => {
          fd.append('files', f, safeFileName(f, 'attachment'));
        });
        await assignmentApi.create(fd);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Assignment' : 'New Assignment'} size="lg">
      <div className="space-y-4">
        <Input
          label="Title"
          placeholder="e.g. Chapter 3 Practice Questions"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />

        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Question / Description
          </label>
          <Textarea
            placeholder="Type the assignment question or instructions here..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">
            Due Date <span className="text-neutral-400">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-200 bg-white/60 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
          />
        </div>

        {/* Existing attachments (edit mode) */}
        {existingAttachments.length > 0 && (
          <div>
            <p className="text-xs font-medium text-neutral-600 mb-1.5">Current Files</p>
            <div className="flex flex-wrap gap-2">
              {existingAttachments.map(att => (
                <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-100 rounded-lg text-xs">
                  <Paperclip size={11} className="text-neutral-500" />
                  <a href={att.file_url} target="_blank" rel="noreferrer"
                    className="text-blue-600 hover:underline max-w-[120px] truncate">
                    {att.file_name}
                  </a>
                  <button onClick={() => removeExistingAttachment(att)}
                    className="text-neutral-400 hover:text-red-500 ml-0.5">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File upload */}
        <div>
          <p className="text-xs font-medium text-neutral-600 mb-1.5">
            {isEdit ? 'Add More Files' : 'Attach Files'}{' '}
            <span className="text-neutral-400">(images, PDF, Word — optional)</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFilePick}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-neutral-200 rounded-xl text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors w-full justify-center"
          >
            <Upload size={14} />
            Click to select files
          </button>
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                  <Paperclip size={11} className="text-blue-500" />
                  <span className="max-w-[120px] truncate text-blue-700">{f.name}</span>
                  <button onClick={() => removeSelectedFile(i)}
                    className="text-blue-400 hover:text-red-500">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? 'Save Changes' : 'Create Assignment'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
