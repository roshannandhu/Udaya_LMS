import React from 'react';
import { ClipboardList, Plus, Edit2, Users, CalendarClock, Paperclip } from 'lucide-react';
import { Btn, Tag } from '../../ui';

export default function AssignmentsSection({ assignments, onCreate, onEdit, onViewSubmissions, onDelete }) {
  if (assignments.length === 0) {
    return (
      <div className="text-center py-14 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <ClipboardList size={24} className="text-neutral-400" />
        </div>
        <h3 className="font-semibold text-neutral-800 mb-1">No assignments yet</h3>
        <p className="text-sm text-neutral-500 mb-5">Create your first assignment for students.</p>
        <Btn variant="primary" icon={Plus} onClick={onCreate}>New assignment</Btn>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {assignments.map(a => {
        const now = new Date();
        const due = a.due_date ? new Date(a.due_date) : null;
        const isPast = due && due < now;
        const isNear = due && !isPast && (due - now) < 24 * 3600 * 1000;
        const submittedCount = a.submitted_count ?? 0;
        return (
          <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4">
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm text-neutral-900 mb-1">{a.title}</h4>
                {a.description && (
                  <p className="text-xs text-neutral-500 line-clamp-2">{a.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Btn size="sm" variant="ghost" icon={Edit2} onClick={() => onEdit(a)}>
                  Edit
                </Btn>
                <Btn size="sm" variant="ghost" icon={Users} onClick={() => onViewSubmissions(a)}>
                  Submissions
                </Btn>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {due && (
                <div className={`flex items-center gap-1 text-xs font-medium ${isPast ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-neutral-500'}`}>
                  <CalendarClock size={11} />
                  Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {isPast && <Tag color="red">Closed</Tag>}
                </div>
              )}
              <span className="text-xs text-neutral-400">
                {submittedCount} submitted
              </span>
              {(a.assignment_attachments || []).length > 0 && (
                <span className="flex items-center gap-1 text-xs text-neutral-400">
                  <Paperclip size={11} />
                  {a.assignment_attachments.length} file{a.assignment_attachments.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex justify-end mt-2">
              <button
                onClick={() => onDelete(a.id)}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
