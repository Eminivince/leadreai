'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface BlurTextProps {
 text: string;
 className?: string;
 delay?: number;
 startDelay?: number;
 as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
 by?: 'word' | 'letter';
}

export function BlurText({
 text,
 className = '',
 delay = 120,
 startDelay = 0,
 as: Tag = 'h1',
 by = 'word',
}: BlurTextProps) {
 const ref = useRef<HTMLElement>(null);
 const [visible, setVisible] = useState(false);

 useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const io = new IntersectionObserver(
   ([entry]) => {
    if (entry?.isIntersecting) {
     setVisible(true);
     io.disconnect();
    }
   },
   { threshold: 0.15 },
  );
  io.observe(el);
  return () => io.disconnect();
 }, []);

 const tokens = by === 'letter' ? text.split('') : text.split(/(\s+)/);

 const keyframes = {
  filter: ['blur(10px)', 'blur(5px)', 'blur(0px)'],
  opacity: [0, 0.5, 1],
  y: [50, -5, 0],
 };

 const MotionTag = motion[Tag as keyof typeof motion] as typeof motion.h1;

 return (
  <MotionTag ref={ref as React.RefObject<HTMLHeadingElement>} className={className} aria-label={text}>
   {tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return <span key={`s-${i}`}>{tok}</span>;
    return (
     <motion.span
      key={i}
      style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
      initial={{ filter: 'blur(10px)', opacity: 0, y: 50 }}
      animate={visible ? keyframes : {}}
      transition={{
       duration: 0.7,
       times: [0, 0.5, 1],
       delay: startDelay + (i * delay) / 1000,
       ease: [0.2, 0.65, 0.3, 0.9],
      }}
     >
      {tok}
     </motion.span>
    );
   })}
  </MotionTag>
 );
}
