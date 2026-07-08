import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

const CustomizedContent = (props) => {
  const { root, depth, x, y, width, height, index, payload, colors, rank, name } = props;
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: depth < 2 ? colors[Math.floor((index / root.children.length) * 6)] : 'transparent',
          stroke: '#fff',
          strokeWidth: 2 / (depth + 1e-10),
          strokeOpacity: 1 / (depth + 1e-10),
          rx: 4,
          ry: 4,
        }}
      />
      {width > 40 && height > 30 ? (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight="bold">
          {name}
        </text>
      ) : null}
    </g>
  );
};

export default function LearningTreemap({ data }) {
  const COLORS = ['#00C2C7', '#7059FF', '#FFC436', '#FF6B6B', '#2DD4BF'];
  return (
    <div className="w-full h-full h-[260px] pt-2">
      <ResponsiveContainer width="100%" height={260}>
        <Treemap
          width={400}
          height={200}
          data={data}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke="#fff"
          fill="#8884d8"
          content={<CustomizedContent colors={COLORS} />}
        >
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
