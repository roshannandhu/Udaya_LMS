import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAssignment, MdEmojiEvents, MdBarChart, MdChevronRight } from 'react-icons/md';
import TopBar from '../../components/shared/TopBar';
import { AnimatedPage, Item, Pressable, SpotlightCard } from '../../components/bits';
import ThemeToggle from '../../components/shared/ThemeToggle';

export default function StudentMorePage() {
  const navigate = useNavigate();

  const items = [
    { icon: MdAssignment, label: 'Tests',       sub: 'Take tests and view results',       onClick: () => navigate('/student/tests') },
    { icon: MdEmojiEvents,       label: 'Leaderboard', sub: 'View class rankings',               onClick: () => navigate('/student/leaderboard') },
    { icon: MdBarChart,     label: 'Report Card', sub: 'View your performance report card', onClick: () => navigate('/student/report') },
  ];

  return (
    <div className="min-h-screen bg-transparent pb-28">
      <TopBar title="Explore More" showSearch={false} />
      <AnimatedPage className="p-4 space-y-3 max-w-xl mx-auto">
        {items.map((item, i) => (
          <Item key={i}>
            <SpotlightCard className="rounded-card">
              <Pressable as="button" onClick={item.onClick}
                className="w-full glass-panel flex items-center gap-3 px-4 py-4 hover:bg-[#F4F2EF] transition-colors text-left">
                <div className="w-8 flex items-center justify-center flex-shrink-0 mr-1">
                  <item.icon className="w-5 h-5 text-neutral-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-neutral-800">{item.label}</p>
                  {item.sub && <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>}
                </div>
                <MdChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
              </Pressable>
            </SpotlightCard>
          </Item>
        ))}

        <Item>
          <div className="glass-panel flex items-center justify-between px-4 py-3 rounded-card">
            <div>
              <p className="font-semibold text-sm text-neutral-800">Appearance</p>
              <p className="text-xs text-neutral-500 mt-0.5">Switch between light and dark</p>
            </div>
            <ThemeToggle showLabel className="border border-[#EFEDEA]" />
          </div>
        </Item>
      </AnimatedPage>
    </div>
  );
}
