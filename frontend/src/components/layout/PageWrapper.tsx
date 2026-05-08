'use client';

import { motion } from 'framer-motion';

export function PageWrapper({ children, className = '' }: { children: React.ReactNode; className?: string }) {
 return (
  <motion.div
   initial={{ opacity: 0, y: 10 }}
   animate={{ opacity: 1, y: 0 }}
   transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
   className={className}
  >
   {children}
  </motion.div>
 );
}

export const fadeUp = {
 initial: { opacity: 0, y: 10 },
 animate: { opacity: 1, y: 0 },
 transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
};

export const staggerContainer = {
 animate: { transition: { staggerChildren: 0.045 } },
};

export const staggerItem = {
 initial: { opacity: 0, y: 8 },
 animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } },
};
