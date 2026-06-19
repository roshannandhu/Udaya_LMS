import React from 'react';
import { StickyNote, Plus, Pin, PinOff, Edit2, Trash2, FileText } from 'lucide-react';
import { Btn } from '../../ui';

export default function NotesSection({ notes, onCreate, onEdit, onDelete, onTogglePin, onView }) {
  if (notes.length === 0) {
    return (
      <div className="text-center py-14 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <StickyNote size={24} className="text-neutral-400" />
        </div>
        <h3 className="font-semibold text-neutral-800 mb-1">No notes yet</h3>
        <p className="text-sm text-neutral-500 mb-5">Add notes, handouts, or PDF materials for students.</p>
        <Btn variant="primary" icon={Plus} onClick={onCreate}>New note</Btn>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {[...notes].sort((a,b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)).map(note => (
        <div key={note.id} className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${note.is_pinned ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-100'}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {note.is_pinned && <Pin size={12} className="text-amber-500 flex-shrink-0"/>}
                <h3 className="text-sm font-semibold text-neutral-900 truncate">{note.title}</h3>
              </div>
              {note.body && <p className="text-sm text-neutral-600 line-clamp-3 whitespace-pre-wrap">{note.body}</p>}
              {(note.storage_path || note.file_url) && (
                <button onClick={() => onView?.(note)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                  <FileText size={13}/> View attachment
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onTogglePin(note)} title={note.is_pinned ? 'Unpin' : 'Pin'}
                className="p-1.5 rounded-md text-neutral-400 hover:text-amber-500 hover:bg-amber-50 transition-colors">
                {note.is_pinned ? <PinOff size={14}/> : <Pin size={14}/>}
              </button>
              <button onClick={() => onEdit(note)}
                className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
                <Edit2 size={14}/>
              </button>
              <button onClick={() => onDelete(note.id)}
                className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 size={14}/>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
