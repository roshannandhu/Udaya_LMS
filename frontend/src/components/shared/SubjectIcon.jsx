import React from 'react';
import {
  MdCalculate, MdFunctions, MdStraighten, MdCategory,
  MdScience, MdBiotech, MdEco, MdRocketLaunch, MdPsychology, MdMonitorHeart, MdMedicalServices,
  MdMenuBook, MdBookmark, MdLocalLibrary, MdCreate, MdEdit, MdNotes, MdLanguage, MdHistoryEdu,
  MdPublic, MdMap, MdAccountBalance, MdGavel, MdBalance, MdHistory, MdLocationCity,
  MdCode, MdTerminal, MdMemory, MdComputer, MdDataArray,
  MdPalette, MdBrush, MdMusicNote, MdMic, MdTheaterComedy,
  MdShowChart, MdBarChart, MdPieChart, MdTrendingUp, MdCurrencyRupee, MdAttachMoney, MdWork,
  MdSchool, MdDomain, MdLightbulb, MdExplore, MdEmojiEvents, MdFitnessCenter, MdStar, MdAutoAwesome, MdExtension, MdFlag
} from 'react-icons/md';

// Categorized icon registry — the single source of truth for subject/standard icons.
// Each entry's `key` is what gets stored in the DB (in the existing `emoji` TEXT column).
export const SUBJECT_ICON_GROUPS = [
  {
    category: 'Maths',
    items: [
      { key: 'calculator', label: 'Maths', Icon: MdCalculate },
      { key: 'sigma', label: 'Algebra', Icon: MdFunctions },
      { key: 'pi', label: 'Geometry', Icon: MdCategory },
      { key: 'ruler', label: 'Measurement', Icon: MdStraighten },
      { key: 'shapes', label: 'Shapes', Icon: MdCategory },
    ],
  },
  {
    category: 'Sciences',
    items: [
      { key: 'atom', label: 'Physics', Icon: MdScience },
      { key: 'flask', label: 'Chemistry', Icon: MdScience },
      { key: 'testtube', label: 'Lab', Icon: MdScience },
      { key: 'microscope', label: 'Microscope', Icon: MdBiotech },
      { key: 'dna', label: 'Biology', Icon: MdBiotech },
      { key: 'leaf', label: 'Botany', Icon: MdEco },
      { key: 'telescope', label: 'Astronomy', Icon: MdExplore },
      { key: 'rocket', label: 'Space', Icon: MdRocketLaunch },
      { key: 'brain', label: 'Psychology', Icon: MdPsychology },
      { key: 'heartpulse', label: 'Health', Icon: MdMonitorHeart },
      { key: 'stethoscope', label: 'Medical', Icon: MdMedicalServices },
    ],
  },
  {
    category: 'Language & Literature',
    items: [
      { key: 'book', label: 'English', Icon: MdMenuBook },
      { key: 'bookmarked', label: 'Literature', Icon: MdBookmark },
      { key: 'library', label: 'Library', Icon: MdLocalLibrary },
      { key: 'pen', label: 'Writing', Icon: MdCreate },
      { key: 'pencil', label: 'Grammar', Icon: MdEdit },
      { key: 'notebook', label: 'Notes', Icon: MdNotes },
      { key: 'languages', label: 'Languages', Icon: MdLanguage },
      { key: 'scroll', label: 'Classics', Icon: MdHistoryEdu },
    ],
  },
  {
    category: 'Social Studies',
    items: [
      { key: 'globe', label: 'Geography', Icon: MdPublic },
      { key: 'map', label: 'Maps', Icon: MdMap },
      { key: 'landmark', label: 'History', Icon: MdAccountBalance },
      { key: 'gavel', label: 'Civics', Icon: MdGavel },
      { key: 'scale', label: 'Law', Icon: MdBalance },
      { key: 'history', label: 'Timeline', Icon: MdHistory },
      { key: 'building', label: 'Society', Icon: MdLocationCity },
    ],
  },
  {
    category: 'Computers',
    items: [
      { key: 'code', label: 'Coding', Icon: MdCode },
      { key: 'terminal', label: 'Terminal', Icon: MdTerminal },
      { key: 'cpu', label: 'Hardware', Icon: MdMemory },
      { key: 'monitor', label: 'IT', Icon: MdComputer },
      { key: 'binary', label: 'Data', Icon: MdDataArray },
    ],
  },
  {
    category: 'Arts',
    items: [
      { key: 'palette', label: 'Art', Icon: MdPalette },
      { key: 'brush', label: 'Painting', Icon: MdBrush },
      { key: 'music', label: 'Music', Icon: MdMusicNote },
      { key: 'mic', label: 'Singing', Icon: MdMic },
      { key: 'drama', label: 'Drama', Icon: MdTheaterComedy },
    ],
  },
  {
    category: 'Commerce',
    items: [
      { key: 'linechart', label: 'Economics', Icon: MdShowChart },
      { key: 'barchart', label: 'Statistics', Icon: MdBarChart },
      { key: 'piechart', label: 'Accounts', Icon: MdPieChart },
      { key: 'trending', label: 'Business', Icon: MdTrendingUp },
      { key: 'rupee', label: 'Finance', Icon: MdCurrencyRupee },
      { key: 'banknote', label: 'Money', Icon: MdAttachMoney },
      { key: 'briefcase', label: 'Commerce', Icon: MdWork },
    ],
  },
  {
    category: 'General',
    items: [
      { key: 'graduation', label: 'Standard', Icon: MdSchool },
      { key: 'school', label: 'School', Icon: MdDomain },
      { key: 'lightbulb', label: 'Ideas', Icon: MdLightbulb },
      { key: 'compass', label: 'Explore', Icon: MdExplore },
      { key: 'trophy', label: 'Achievement', Icon: MdEmojiEvents },
      { key: 'dumbbell', label: 'Sports', Icon: MdFitnessCenter },
      { key: 'star', label: 'Star', Icon: MdStar },
      { key: 'sparkles', label: 'Sparkle', Icon: MdAutoAwesome },
      { key: 'puzzle', label: 'Puzzle', Icon: MdExtension },
      { key: 'flag', label: 'Flag', Icon: MdFlag },
      { key: 'bookmark', label: 'Bookmark', Icon: MdBookmark },
    ],
  },
];

// Flat lookup: key -> { label, Icon }
export const SUBJECT_ICONS = SUBJECT_ICON_GROUPS.flatMap((g) => g.items);
const REGISTRY = Object.fromEntries(SUBJECT_ICONS.map((i) => [i.key, i]));

// Maps every legacy emoji that was ever stored/used to a registry key, so existing
// records (which hold an emoji char in the `emoji` column) keep rendering correctly
// with no DB migration.
export const LEGACY_EMOJI_MAP = {
  '📚': 'book', '📖': 'book', '📕': 'book', '📘': 'book', '📗': 'book',
  '📐': 'calculator', '🧮': 'calculator', '🔢': 'calculator',
  '⚗️': 'flask', '⚗': 'flask',
  '⚛️': 'atom', '⚛': 'atom',
  '🧪': 'testtube',
  '🔬': 'microscope',
  '🧬': 'dna',
  '🎓': 'graduation',
  '🏫': 'school',
  '📝': 'notebook', '✏️': 'pencil', '✏': 'pencil',
  '🎨': 'palette',
  '🎵': 'music', '🎶': 'music',
  '💻': 'code',
  '📊': 'barchart', '📈': 'trending',
  '🌍': 'globe', '🌎': 'globe', '🌏': 'globe',
  '💡': 'lightbulb',
  '✨': 'sparkles', '💎': 'sparkles', '🌈': 'sparkles',
  '🌟': 'star', '⭐': 'star',
  '🏆': 'trophy',
  '⚡': 'lightbulb',
  '🐣': 'star',
};

// Auto-suggest an icon key based on a subject name string
export const suggestIconForSubject = (name) => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  
  if (n.includes('math') || n.includes('algebra') || n.includes('geometry') || n.includes('calc')) return 'calculator';
  if (n.includes('physic')) return 'atom';
  if (n.includes('chemist')) return 'flask';
  if (n.includes('bio') || n.includes('botany') || n.includes('zoology')) return 'dna';
  if (n.includes('sci')) return 'microscope';
  
  if (n.includes('english') || n.includes('lit') || n.includes('gramm')) return 'book';
  if (n.includes('hist')) return 'landmark';
  if (n.includes('geo') || n.includes('earth')) return 'globe';
  if (n.includes('civic') || n.includes('politi')) return 'gavel';
  if (n.includes('econ') || n.includes('commerc') || n.includes('business') || n.includes('account')) return 'piechart';
  
  if (n.includes('comp') || n.includes('info') || n.includes('tech') || n.includes('cod') || n.includes('program')) return 'monitor';
  
  if (n.includes('art') || n.includes('draw') || n.includes('paint')) return 'palette';
  if (n.includes('music')) return 'music';
  
  return null; // No strong match
};

// Resolve any stored value (new icon key OR legacy emoji char) to a registry key.
export function resolveIconKey(value, fallback = 'book') {
  if (value && REGISTRY[value]) return value;
  if (value && LEGACY_EMOJI_MAP[value]) return LEGACY_EMOJI_MAP[value];
  return fallback;
}

// Render the lucide icon for a stored subject/standard value.
export default function SubjectIcon({ value, size = 20, className = '', fallback = 'book' }) {
  const Icon = REGISTRY[resolveIconKey(value, fallback)].Icon;
  return <Icon size={size} className={className} />;
}

// Reusable categorized icon-picker grid. Replaces the old emoji-picker grids so every
// picker in the app looks identical. `value` is the current key (or legacy emoji);
// `onChange(key)` fires with the selected registry key.
export function IconPicker({ value, onChange, fallback = 'book', className = '' }) {
  const selected = resolveIconKey(value, fallback);
  return (
    <div className={`space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar ${className}`}>
      {SUBJECT_ICON_GROUPS.map((g) => (
        <div key={g.category}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">{g.category}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                title={label}
                onClick={() => onChange(key)}
                className={`w-9 h-9 rounded-md flex items-center justify-center transition-all ${
                  selected === key
                    ? 'bg-neutral-900 text-white ring-2 ring-neutral-300'
                    : 'bg-white/40 text-neutral-700 hover:bg-white/70'
                }`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
