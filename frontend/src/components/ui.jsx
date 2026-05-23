import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const Btn = ({ children, variant = 'default', size = 'md', icon: Icon, onClick, className = '', disabled = false, type = 'button' }) => {
  const variants = {
    primary:     'bg-neutral-900/90 backdrop-blur-sm text-white hover:bg-neutral-800 border border-neutral-900/20 shadow-md shadow-neutral-900/10',
    default:     'bg-white/50 backdrop-blur-md text-neutral-900 hover:bg-white/80 border border-white/60 shadow-sm',
    ghost:       'text-neutral-700 hover:bg-white/40 backdrop-blur-sm border border-transparent',
    danger:      'text-red-600 hover:bg-red-50/50 backdrop-blur-sm border border-transparent',
    dangerSolid: 'bg-red-600/90 backdrop-blur-sm text-white hover:bg-red-700 border border-red-600/20 shadow-md shadow-red-600/10',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2 text-sm' };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
};

export const Input = ({ label, type = 'text', placeholder, value, onChange, autoFocus = false, ...rest }) => (
  <div>
    {label && <label className="text-xs font-medium text-neutral-600 mb-1.5 block">{label}</label>}
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      {...rest}
      className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400"
    />
  </div>
);

export const Textarea = ({ label, placeholder, value, onChange, rows = 3, ...rest }) => (
  <div>
    {label && <label className="text-xs font-medium text-neutral-600 mb-1.5 block">{label}</label>}
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      {...rest}
      className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400 resize-none"
    />
  </div>
);

export const Avatar = ({ name, size = 'md' }) => {
  const initials = name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-xl' };
  const bgs   = ['#FDEBEC', '#FBF3DB', '#DDEDEA', '#E6F0FA', '#EAE4F2', '#F4DFEB'];
  const texts = ['#E03E3E', '#CB912F', '#0F7B6C', '#2383E2', '#6940A5', '#AD1A72'];
  const idx   = (name?.charCodeAt(0) || 0) % bgs.length;
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ background: bgs[idx], color: texts[idx] }}>
      {initials}
    </div>
  );
};

export const Tag = ({ children, color = 'gray' }) => {
  const map = {
    gray:   { bg: '#F1F1EF', text: '#1A1A19' },
    blue:   { bg: '#E6F0FA', text: '#2383E2' },
    green:  { bg: '#DDEDEA', text: '#0F7B6C' },
    amber:  { bg: '#FBF3DB', text: '#CB912F' },
    red:    { bg: '#FDEBEC', text: '#E03E3E' },
    purple: { bg: '#EAE4F2', text: '#6940A5' },
    pink:   { bg: '#F4DFEB', text: '#AD1A72' },
  };
  const c = map[color] || map.gray;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium backdrop-blur-sm border border-white/40 shadow-sm"
      style={{ background: `${c.bg}b3`, color: c.text }}> {/* b3 = 70% opacity for hex */}
      {children}
    </span>
  );
};

export const Divider = ({ className = '' }) => <div className={`h-px bg-neutral-200 ${className}`} />;

export const EmojiTile = ({ emoji, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-xl', lg: 'w-14 h-14 text-2xl', xl: 'w-20 h-20 text-4xl' };
  return <div className={`${sizes[size]} rounded-lg bg-white/50 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-center flex-shrink-0`}>{emoji}</div>;
};

export const Toggle = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
  </button>
);

export const SectionHeader = ({ title, action, count }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {count !== undefined && <span className="text-xs text-neutral-400">{count}</span>}
    </div>
    {action}
  </div>
);

export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/30 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full ${sizes[size]} max-h-[90vh] overflow-y-auto glass-panel rounded-xl`}>
        <div className="px-5 py-4 border-b border-white/30 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-white/40"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-neutral-200 rounded ${className}`} />
);

export const Sheet = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-end bg-neutral-900/30 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 md:bottom-auto md:right-0 md:top-0 w-full md:w-[480px] glass-panel md:rounded-l-2xl rounded-t-2xl flex flex-col max-h-[92vh] md:max-h-none animate-in slide-up border-l border-white/50">
        <div className="px-5 py-4 border-b border-white/30 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-white/40"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};
