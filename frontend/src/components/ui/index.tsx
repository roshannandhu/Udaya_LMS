import React from 'react';
import { X } from 'lucide-react';

export const Btn = ({ children, variant = 'default', size = 'md', icon: Icon, onClick, className = '', disabled = false, type = 'button' }) => {
  const variants = {
    primary:     'bg-neutral-900 text-white hover:bg-neutral-800 border border-neutral-900 rounded-full',
    default:     'glass-btn text-neutral-800 hover:text-neutral-900',
    outline:     'bg-transparent text-neutral-700 hover:bg-white/40 border border-neutral-300 rounded-full',
    ghost:       'text-neutral-700 hover:bg-white/40 border border-transparent rounded-full',
    danger:      'text-red-600 hover:bg-red-50 border border-transparent rounded-full',
    dangerSolid: 'bg-red-600 text-white hover:bg-red-700 border border-red-600 rounded-full',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-sm' };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 font-medium transition-all ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
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
      className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm transition-all placeholder:text-neutral-400"
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
      className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm transition-all placeholder:text-neutral-400 resize-none"
    />
  </div>
);

export const Avatar = ({ name, size = 'md', src }) => {
  const initials = name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-xl' };
  const bgs   = ['#FDEBEC', '#FBF3DB', '#DDEDEA', '#E6F0FA', '#EAE4F2', '#F4DFEB'];
  const texts = ['#E03E3E', '#CB912F', '#0F7B6C', '#2383E2', '#6940A5', '#AD1A72'];
  const idx   = (name?.charCodeAt(0) || 0) % bgs.length;
  
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  
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
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
      style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
};

export const Divider = ({ className = '' }) => <div className={`h-px bg-neutral-200 ${className}`} />;

export const EmojiTile = ({ emoji, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-xl', lg: 'w-14 h-14 text-2xl', xl: 'w-20 h-20 text-4xl' };
  return <div className={`${sizes[size]} rounded-lg bg-white/50 flex items-center justify-center flex-shrink-0`}>{emoji}</div>;
};

export const Toggle = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`relative w-[3.25rem] h-8 transition-colors flex-shrink-0 glass-toggle-track ${checked ? 'bg-white/40' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <div className={`absolute top-1 w-6 h-6 glass-toggle-thumb transition-all duration-300 ${checked ? 'left-[1.5rem]' : 'left-1'}`} />
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
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-2xl', '2xl': 'max-w-3xl', '4xl': 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4 bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full lg:w-full ${sizes[size] || sizes.md} max-h-[90vh] flex flex-col glass-panel rounded-t-2xl lg:rounded-lg shadow-2xl lg:border border-white/60 animate-in slide-up lg:animate-none`}>
        <div className="px-5 py-4 border-b border-white/40 flex items-center justify-between flex-shrink-0 bg-white/40 rounded-t-2xl lg:rounded-t-lg">
          <h2 className="text-sm font-semibold">{title}</h2>
          {onClose && <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-white/60"><X size={16} /></button>}
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export const Sheet = ({ open, onClose, title, children, size = 'md' }) => {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };
  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-end bg-neutral-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 md:bottom-auto md:right-0 md:top-0 w-full ${widths[size]} glass-panel md:border-l border-white/60 md:rounded-l-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] md:max-h-none animate-in slide-up`}>
        <div className="px-5 py-4 border-b border-white/40 bg-white/40 rounded-t-2xl md:rounded-tl-2xl flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-white/60"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};

export const Select = ({ label, options, value, onChange, placeholder = 'Select...' }) => (
  <div>
    {label && <label className="text-xs font-medium text-neutral-600 mb-1.5 block">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm transition-all appearance-none cursor-pointer"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6,9 12,15 18,9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export const Badge = ({ children, variant = 'default' }) => {
  const variants = {
    default: 'bg-white/50 text-neutral-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-neutral-200 rounded ${className}`} />
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    {Icon && <div className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center mb-4"><Icon size={24} className="text-neutral-400" /></div>}
    <h3 className="text-sm font-semibold text-neutral-900 mb-1">{title}</h3>
    {description && <p className="text-xs text-neutral-500 mb-4">{description}</p>}
    {action}
  </div>
);

export const Card = ({ children, className = '', onClick }) => (
    <div
      onClick={onClick}
      className={`glass-panel p-5 ${onClick ? 'cursor-pointer hover:bg-white/40 transition-colors' : ''} ${className}`}
    >
    {children}
  </div>
);

export const ListItem = ({ icon: Icon, title, subtitle, right, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 hover:bg-white/40 rounded-lg transition-colors text-left"
  >
    {Icon && <div className="w-9 h-9 rounded-full bg-white/50 flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-neutral-600" /></div>}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-neutral-900 truncate">{title}</p>
      {subtitle && <p className="text-xs text-neutral-500 truncate mt-0.5">{subtitle}</p>}
    </div>
    {right}
  </button>
);