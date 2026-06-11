import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/api';

const PRESETS = [
  { key: 'male',    label: 'Boy',     src: '/avatar-male.svg' },
  { key: 'female',  label: 'Girl',    src: '/avatar-female.svg' },
  { key: 'default', label: 'Neutral', src: '/avatar-neutral.svg' },
];

/**
 * Simple male/female/neutral profile-icon chooser. Saves via
 * PATCH /students/me { avatar_preset } and reports the resulting
 * avatar_url sentinel ("preset:male" | "preset:female" | null) to onSaved.
 */
export default function AvatarPresetPicker({ value, onSaved, size = 'md' }) {
  const [saving, setSaving] = useState(null);   // key being saved
  const [error, setError] = useState('');

  const selectedKey =
    value === 'preset:male' ? 'male' :
    value === 'preset:female' ? 'female' :
    !value ? 'default' : null;   // null = custom photo

  const pick = async (key) => {
    if (saving || key === selectedKey) return;
    setSaving(key);
    setError('');
    try {
      await apiClient('/students/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_preset: key }),
      });
      onSaved?.(key === 'default' ? null : `preset:${key}`);
    } catch (e) {
      setError(e?.message || 'Could not save your choice.');
    } finally {
      setSaving(null);
    }
  };

  const dim = size === 'lg' ? 'w-20 h-20' : 'w-14 h-14';

  return (
    <div>
      <div className="flex items-center justify-center gap-4">
        {PRESETS.map(p => {
          const active = p.key === selectedKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              disabled={!!saving}
              className="flex flex-col items-center gap-1.5 group"
              title={`Use the ${p.label.toLowerCase()} icon`}
            >
              <span className={`relative ${dim} rounded-full overflow-hidden border-2 transition-all
                ${active ? 'border-neutral-900 ring-2 ring-neutral-300' : 'border-[#EFEDEA] group-hover:border-neutral-400'}`}>
                <img src={p.src} alt={p.label} className="w-full h-full object-cover" draggable={false} />
                {saving === p.key && (
                  <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-neutral-600" />
                  </span>
                )}
                {active && saving !== p.key && (
                  <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-neutral-900 flex items-center justify-center">
                    <Check size={11} className="text-white" />
                  </span>
                )}
              </span>
              <span className={`text-xs font-medium ${active ? 'text-neutral-900' : 'text-neutral-500'}`}>{p.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600 text-center mt-2">{error}</p>}
    </div>
  );
}
