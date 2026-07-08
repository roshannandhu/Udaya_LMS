import React from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';

export default function TopicPolarArea({ data }) {
  // data: [{ topic: 'Algebra', score: 90 }, { topic: 'Geometry', score: 65 }, ...]
  return (
    <div className="w-full h-full min-h-[220px] pt-2">
      <ResponsiveContainer width="100%" height={220}>
        {/* We use RadarChart but style it to look like a Polar Area Chart by using fill on the whole polygon */}
        <RadarChart cx="50%" cy="50%" outerRadius="55%" data={data}>
          <PolarGrid stroke="#E5E7EB" gridType="polygon" />
          <PolarAngleAxis dataKey="topic" tick={{ fill: '#112B3C', fontSize: 10, fontWeight: 'bold' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Radar name="Score" dataKey="score" stroke="#00C2C7" strokeWidth={2} fill="#00C2C7" fillOpacity={0.6} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
