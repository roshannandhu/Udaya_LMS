import React from 'react';

// Reusable faux-glass card. The look (translucent rgba bg, white border, soft
// indigo shadow, hover lift + shimmer sweep, dark-mode variant) is defined by
// the `.glass-card` class in index.css. Faux = NO backdrop-filter, so it never
// costs blur performance on low-end phones. Drop-in around any content.
export default function GlassCard({ as = 'div', className = '', children, ...rest }) {
  const Comp = as;
  return (
    <Comp className={`glass-card ${className}`} {...rest}>
      {children}
    </Comp>
  );
}
