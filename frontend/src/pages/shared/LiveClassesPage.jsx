import React from 'react';
import { Video } from 'lucide-react';

export default function LiveClassesPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
        <Video size={28} className="text-neutral-500" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-800 mb-2">Live Classes</h2>
      <p className="text-sm text-neutral-500 max-w-xs">
        Live classes will appear here. This feature is coming soon.
      </p>
    </div>
  );
}
