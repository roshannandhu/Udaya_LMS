import React from 'react';
import { FileQuestion, Plus, Edit2, ListChecks } from 'lucide-react';
import { Btn, Tag } from '../../ui';

export default function TestsSection({ tests, onCreate, onEdit, onResults }) {
  if (tests.length === 0) {
    return (
      <div className="text-center py-14 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <FileQuestion size={24} className="text-neutral-400" />
        </div>
        <h3 className="font-semibold text-neutral-800 mb-1">No tests yet</h3>
        <p className="text-sm text-neutral-500 mb-5">Create your first MCQ test.</p>
        <Btn variant="primary" icon={Plus} onClick={onCreate}>Create test</Btn>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {tests.map((t) => (
        <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4 className="font-semibold text-sm text-neutral-900">{t.title}</h4>
                {t.negative_marking && <Tag color="red">−{t.penalty}</Tag>}
              </div>
              <p className="text-xs text-neutral-500">
                {t.duration_mins} min · {t.total_marks} marks
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Btn size="sm" variant="ghost" icon={Edit2} onClick={() => onEdit(t)}>
                Edit
              </Btn>
              <Btn size="sm" variant="ghost" icon={ListChecks} onClick={() => onResults(t)}>
                Results
              </Btn>
              <Tag color={t.status === 'completed' ? 'green' : t.status === 'scheduled' ? 'amber' : 'gray'}>
                {t.status}
              </Tag>
            </div>
          </div>
          {t.scheduled_for && (
            <div className="text-xs text-amber-700 pt-2 border-t border-neutral-100">
              Publishes on {new Date(t.scheduled_for).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
