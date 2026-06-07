import React from 'react';
import {
  // Maths
  Calculator, Sigma, Pi, Ruler, Shapes,
  // Sciences
  Atom, FlaskConical, TestTube, Microscope, Dna, Leaf, Telescope, Rocket, Brain, HeartPulse, Stethoscope,
  // Language & literature
  BookOpen, BookMarked, Library, PenTool, Pencil, NotebookPen, Languages, ScrollText,
  // Social studies
  Globe2, Map, Landmark, Gavel, Scale, History, Building2,
  // Computers
  Code2, Terminal, Cpu, MonitorPlay, Binary,
  // Arts
  Palette, Paintbrush, Music, Mic, Drama,
  // Commerce / economics
  LineChart, BarChart3, PieChart, TrendingUp, IndianRupee, Banknote, Briefcase,
  // General
  GraduationCap, School, Lightbulb, Compass, Trophy, Dumbbell, Star, Sparkles, Puzzle, Flag, Bookmark,
} from 'lucide-react';

// Categorized icon registry — the single source of truth for subject/standard icons.
// Each entry's `key` is what gets stored in the DB (in the existing `emoji` TEXT column).
export const SUBJECT_ICON_GROUPS = [
  {
    category: 'Maths',
    items: [
      { key: 'calculator', label: 'Maths', Icon: Calculator },
      { key: 'sigma', label: 'Algebra', Icon: Sigma },
      { key: 'pi', label: 'Geometry', Icon: Pi },
      { key: 'ruler', label: 'Measurement', Icon: Ruler },
      { key: 'shapes', label: 'Shapes', Icon: Shapes },
    ],
  },
  {
    category: 'Sciences',
    items: [
      { key: 'atom', label: 'Physics', Icon: Atom },
      { key: 'flask', label: 'Chemistry', Icon: FlaskConical },
      { key: 'testtube', label: 'Lab', Icon: TestTube },
      { key: 'microscope', label: 'Microscope', Icon: Microscope },
      { key: 'dna', label: 'Biology', Icon: Dna },
      { key: 'leaf', label: 'Botany', Icon: Leaf },
      { key: 'telescope', label: 'Astronomy', Icon: Telescope },
      { key: 'rocket', label: 'Space', Icon: Rocket },
      { key: 'brain', label: 'Psychology', Icon: Brain },
      { key: 'heartpulse', label: 'Health', Icon: HeartPulse },
      { key: 'stethoscope', label: 'Medical', Icon: Stethoscope },
    ],
  },
  {
    category: 'Language & Literature',
    items: [
      { key: 'book', label: 'English', Icon: BookOpen },
      { key: 'bookmarked', label: 'Literature', Icon: BookMarked },
      { key: 'library', label: 'Library', Icon: Library },
      { key: 'pen', label: 'Writing', Icon: PenTool },
      { key: 'pencil', label: 'Grammar', Icon: Pencil },
      { key: 'notebook', label: 'Notes', Icon: NotebookPen },
      { key: 'languages', label: 'Languages', Icon: Languages },
      { key: 'scroll', label: 'Classics', Icon: ScrollText },
    ],
  },
  {
    category: 'Social Studies',
    items: [
      { key: 'globe', label: 'Geography', Icon: Globe2 },
      { key: 'map', label: 'Maps', Icon: Map },
      { key: 'landmark', label: 'History', Icon: Landmark },
      { key: 'gavel', label: 'Civics', Icon: Gavel },
      { key: 'scale', label: 'Law', Icon: Scale },
      { key: 'history', label: 'Timeline', Icon: History },
      { key: 'building', label: 'Society', Icon: Building2 },
    ],
  },
  {
    category: 'Computers',
    items: [
      { key: 'code', label: 'Coding', Icon: Code2 },
      { key: 'terminal', label: 'Terminal', Icon: Terminal },
      { key: 'cpu', label: 'Hardware', Icon: Cpu },
      { key: 'monitor', label: 'IT', Icon: MonitorPlay },
      { key: 'binary', label: 'Data', Icon: Binary },
    ],
  },
  {
    category: 'Arts',
    items: [
      { key: 'palette', label: 'Art', Icon: Palette },
      { key: 'brush', label: 'Painting', Icon: Paintbrush },
      { key: 'music', label: 'Music', Icon: Music },
      { key: 'mic', label: 'Singing', Icon: Mic },
      { key: 'drama', label: 'Drama', Icon: Drama },
    ],
  },
  {
    category: 'Commerce',
    items: [
      { key: 'linechart', label: 'Economics', Icon: LineChart },
      { key: 'barchart', label: 'Statistics', Icon: BarChart3 },
      { key: 'piechart', label: 'Accounts', Icon: PieChart },
      { key: 'trending', label: 'Business', Icon: TrendingUp },
      { key: 'rupee', label: 'Finance', Icon: IndianRupee },
      { key: 'banknote', label: 'Money', Icon: Banknote },
      { key: 'briefcase', label: 'Commerce', Icon: Briefcase },
    ],
  },
  {
    category: 'General',
    items: [
      { key: 'graduation', label: 'Standard', Icon: GraduationCap },
      { key: 'school', label: 'School', Icon: School },
      { key: 'lightbulb', label: 'Ideas', Icon: Lightbulb },
      { key: 'compass', label: 'Explore', Icon: Compass },
      { key: 'trophy', label: 'Achievement', Icon: Trophy },
      { key: 'dumbbell', label: 'Sports', Icon: Dumbbell },
      { key: 'star', label: 'Star', Icon: Star },
      { key: 'sparkles', label: 'Sparkle', Icon: Sparkles },
      { key: 'puzzle', label: 'Puzzle', Icon: Puzzle },
      { key: 'flag', label: 'Flag', Icon: Flag },
      { key: 'bookmark', label: 'Bookmark', Icon: Bookmark },
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

// Resolve any stored value (new icon key OR legacy emoji char) to a registry key.
export function resolveIconKey(value, fallback = 'book') {
  if (value && REGISTRY[value]) return value;
  if (value && LEGACY_EMOJI_MAP[value]) return LEGACY_EMOJI_MAP[value];
  return fallback;
}

// Render the lucide icon for a stored subject/standard value.
export default function SubjectIcon({ value, size = 20, className = '', fallback = 'book', strokeWidth }) {
  const Icon = REGISTRY[resolveIconKey(value, fallback)].Icon;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />;
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
