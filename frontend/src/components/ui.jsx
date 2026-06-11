import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { popIn } from '../lib/motion';

export const Btn = ({ children, variant = 'default', size = 'md', icon: Icon, onClick, className = '', disabled = false, type = 'button', ...rest }) => {
  const variants = {
    primary:     'bg-ink text-white hover:bg-neutral-800 border border-ink',
    default:     'bg-white text-neutral-900 hover:bg-[#F4F2EF] border border-[#EFEDEA] shadow-card',
    ghost:       'text-neutral-700 hover:bg-[#F4F2EF] border border-transparent',
    pastel:      'bg-pastel-mint text-pastel-mint-fg hover:brightness-95 border border-transparent',
    danger:      'text-red-600 hover:bg-red-50 border border-transparent',
    dangerSolid: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill font-medium transition-colors ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={15} strokeWidth={2} />}
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
      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none text-sm placeholder:text-neutral-400 transition-colors"
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
      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none text-sm placeholder:text-neutral-400 resize-none transition-colors"
    />
  </div>
);

// Pastel palette shared by Avatar / Tag / EmojiTile for consistent colour.
const PASTELS = [
  { bg: '#FCE6DD', text: '#C2410C' }, // peach
  { bg: '#FBF1D9', text: '#B7791F' }, // cream
  { bg: '#DFF5EC', text: '#0F7B6C' }, // mint
  { bg: '#E3EFFB', text: '#2383E2' }, // sky
  { bg: '#EAE4F2', text: '#6940A5' }, // lavender
  { bg: '#F7E3F0', text: '#AD1A72' }, // pink
];

// avatar_url can hold a real photo URL OR a preset sentinel chosen by the
// student ("preset:male" / "preset:female"). Resolve sentinels to the bundled
// icons; null/undefined falls back to the neutral default avatar.
export const AVATAR_PRESETS = {
  'preset:male':   '/avatar-male.svg',
  'preset:female': '/avatar-female.svg',
};
export const resolveAvatar = (src) => (src ? (AVATAR_PRESETS[src] || src) : null);

export const Avatar = ({ name, src, size = 'md' }) => {
  const [imgError, setImgError] = React.useState(false);
  const initials = name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-xl' };
  const idx   = (name?.charCodeAt(0) || 0) % PASTELS.length;
  const resolved = resolveAvatar(src);
  if (resolved && !imgError) {
    return <img src={resolved} alt={name || ''} onError={() => setImgError(true)}
      className={`${sizes[size]} rounded-full object-cover flex-shrink-0 border border-[#EFEDEA]`} />;
  }
  return (
    <img src="/avatar-neutral.svg" alt="Default Avatar"
      className={`${sizes[size]} rounded-full object-cover flex-shrink-0 border border-[#EFEDEA] shadow-sm`} />
  );
};

export const Tag = ({ children, color = 'gray' }) => {
  const map = {
    gray:   { bg: '#F1F1EF', text: '#4B4B49' },
    blue:   { bg: '#E3EFFB', text: '#2383E2' },
    sky:    { bg: '#E3EFFB', text: '#2383E2' },
    green:  { bg: '#DFF5EC', text: '#0F7B6C' },
    mint:   { bg: '#DFF5EC', text: '#0F7B6C' },
    amber:  { bg: '#FBF1D9', text: '#B7791F' },
    cream:  { bg: '#FBF1D9', text: '#B7791F' },
    red:    { bg: '#FCE6DD', text: '#C2410C' },
    peach:  { bg: '#FCE6DD', text: '#C2410C' },
    purple: { bg: '#EAE4F2', text: '#6940A5' },
    lavender:{ bg: '#EAE4F2', text: '#6940A5' },
    pink:   { bg: '#F7E3F0', text: '#AD1A72' },
  };
  const c = map[color] || map.gray;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-semibold"
      style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
};

export const Divider = ({ className = '' }) => <div className={`h-px bg-neutral-200 ${className}`} />;

// Pastel emoji tile. Optional `color` chooses a pastel; default cycles per emoji.
export const EmojiTile = ({ emoji, size = 'md', color }) => {
  const sizes = { sm: 'w-9 h-9 text-base', md: 'w-12 h-12 text-xl', lg: 'w-16 h-16 text-2xl', xl: 'w-20 h-20 text-4xl' };
  const idx = color
    ? { peach: 0, cream: 1, mint: 2, sky: 3, lavender: 4, pink: 5 }[color] ?? 2
    : (emoji ? emoji.codePointAt(0) % PASTELS.length : 2);
  return (
    <div className={`${sizes[size]} rounded-2xl flex items-center justify-center flex-shrink-0`}
      style={{ background: PASTELS[idx].bg }}>
      {emoji}
    </div>
  );
};

export const Toggle = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-ink' : 'bg-neutral-300'}`}>
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
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-5xl', '2xl': 'max-w-6xl', '4xl': 'max-w-6xl' };
  return (
    <motion.div
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
      initial="hidden" animate="show"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()}
        variants={popIn} initial="hidden" animate="show"
        className={`w-full ${sizes[size]} max-h-[90vh] overflow-y-auto glass-panel`}>
        <div className="px-5 py-4 border-b border-[#EFEDEA] flex items-center justify-between sticky top-0 z-10 bg-white rounded-t-card">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded-lg hover:bg-[#F4F2EF]"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>
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
    <motion.div
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
      initial="hidden" animate="show"
      className="fixed inset-0 z-50 flex md:items-center md:justify-end bg-neutral-900/40" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ x: '8%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}
        className="absolute bottom-0 md:bottom-auto md:right-0 md:top-0 w-full md:w-[480px] bg-white shadow-lift md:rounded-l-card rounded-t-card flex flex-col max-h-[92vh] md:max-h-none border-l border-[#EFEDEA]">
        <div className="px-5 py-4 border-b border-[#EFEDEA] flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded-lg hover:bg-[#F4F2EF]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
};
