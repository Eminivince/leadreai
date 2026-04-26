'use client';
import { Badge } from '@/components/ui/badge';

const SENIORITY_CONFIG = {
  c_level: { label: 'C-Level', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  vp: { label: 'VP', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  director: { label: 'Director', className: 'bg-green-100 text-green-800 border-green-200' },
  manager: { label: 'Manager', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  ic: { label: 'IC', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  unknown: { label: 'Unknown', className: 'bg-gray-50 text-gray-500 border-gray-100' },
} as const;

export function SeniorityBadge({ seniority }: { seniority?: string }) {
  const config = SENIORITY_CONFIG[seniority as keyof typeof SENIORITY_CONFIG] ?? SENIORITY_CONFIG.unknown;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
