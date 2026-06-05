import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Trophy, BarChart3, ChevronRight } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { PASTEL } from '../../components/cards/pastel';

export default function StudentMorePage() {
  const navigate = useNavigate();

  const items = [
    { icon: FileQuestion, label: 'Tests',       sub: 'Take tests and view results',         color: 'cream',    onClick: () => navigate('/student/tests') },
    { icon: Trophy,       label: 'Leaderboard', sub: 'View class rankings',                  color: 'lavender', onClick: () => navigate('/student/leaderboard') },
    { icon: BarChart3,    label: 'Report Card',  sub: 'View your performance report card',   color: 'mint',     onClick: () => navigate('/student/report') },
  ];

  return (
    <div className="min-h-screen bg-transparent pb-28">
      <TopBar title="Explore More" showSearch={false} />
      <div className="p-4 space-y-4 max-w-xl mx-auto">
        <div className="glass-panel divide-y divide-[#F1EFEC]">
          {items.map((item, i) => (
            <button key={i} onClick={item.onClick} className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#F4F2EF] transition-colors text-left">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: PASTEL[item.color]?.hex }}>
                <item.icon size={20} style={{ color: PASTEL[item.color]?.fgHex }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-neutral-800">{item.label}</p>
                {item.sub && <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>}
              </div>
              <ChevronRight size={18} className="text-neutral-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
