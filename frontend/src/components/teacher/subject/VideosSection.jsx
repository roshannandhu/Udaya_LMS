import React from 'react';
import { Video, Upload, Plus } from 'lucide-react';
import { Btn } from '../../ui';
import VideoCard from './VideoCard';

export default function VideosSection({ videos, thumbnailUrls, studentsCount, onAdd, onView, onMenu }) {
  if (videos.length === 0) {
    return (
      <div className="text-center py-14 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <Video size={24} className="text-neutral-400" />
        </div>
        <h3 className="font-semibold text-neutral-800 mb-1">No videos yet</h3>
        <p className="text-sm text-neutral-500 mb-5">Add your first YouTube video link.</p>
        <Btn variant="primary" icon={Upload} onClick={onAdd}>Add video</Btn>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {videos.map(v => (
        <VideoCard
          key={v.id}
          video={v}
          thumbnail={thumbnailUrls[v.id]}
          studentsCount={studentsCount}
          onView={onView}
          onMenu={onMenu}
        />
      ))}
      <button
        onClick={onAdd}
        className="aspect-video rounded-2xl border-2 border-dashed border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition-all flex flex-col items-center justify-center gap-2 text-neutral-400 hover:text-neutral-600"
      >
        <div className="w-10 h-10 rounded-full border-2 border-neutral-300 flex items-center justify-center">
          <Plus size={18} />
        </div>
        <span className="text-xs font-medium">Add video</span>
      </button>
    </div>
  );
}
