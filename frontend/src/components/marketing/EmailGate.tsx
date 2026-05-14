'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function EmailGate({ query }: { query: string }) {
 const [email, setEmail] = useState('');
 const [loading, setLoading] = useState(false);
 const router = useRouter();

 function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!email) return;
  setLoading(true);
  try {
   router.push(
    `/auth/register?q=${encodeURIComponent(query)}&email=${encodeURIComponent(email)}`
   );
  } catch {
   setLoading(false);
  }
 }

 return (
  <motion.form
   onSubmit={handleSubmit}
   initial={{ opacity: 0, y: -8 }}
   animate={{ opacity: 1, y: 0 }}
   exit={{ opacity: 0, y: -8 }}
   transition={{ duration: 0.2 }}
   className="w-full bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] rounded-xl p-3.5 flex flex-wrap items-center gap-3"
  >
   <span className="text-lg shrink-0" aria-hidden={true}>🔒</span>
   <div className="flex-1 min-w-[160px]">
    <p className="text-[13px] font-semibold text-[color:var(--alt-ink)] leading-snug">
     Enter your work email to run this search
    </p>
    <p className="text-[11px] text-[color:var(--alt-ink-3)]">
     Free. No credit card. Results in 10–15 minutes.
    </p>
   </div>
   <div className="flex gap-2 shrink-0 flex-wrap">
    <input
     type="email"
     required
     placeholder="you@company.com"
     value={email}
     onChange={e => setEmail(e.target.value)}
     className="text-[12px] border border-[color:var(--alt-rule)] rounded-lg px-3 py-2 w-44 bg-[color:var(--paper)] focus:outline-none focus:border-[color:var(--alt-amber)] transition-colors"
    />
    <button
     type="submit"
     disabled={loading}
     className="text-[12px] font-semibold bg-[color:var(--alt-ink)] text-white rounded-lg px-4 py-2 whitespace-nowrap hover:opacity-90 transition-opacity disabled:opacity-50"
    >
     {loading ? 'Loading…' : 'Get results →'}
    </button>
   </div>
  </motion.form>
 );
}
