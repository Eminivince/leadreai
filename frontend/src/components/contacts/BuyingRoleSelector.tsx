'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLES = [
 { value: 'champion', label: 'Champion' },
 { value: 'economic_buyer', label: 'Economic Buyer' },
 { value: 'technical_buyer', label: 'Technical Buyer' },
 { value: 'blocker', label: 'Blocker' },
 { value: 'influencer', label: 'Influencer' },
 { value: 'unknown', label: 'Unknown' },
] as const;

export function BuyingRoleSelector({ value, onChange, disabled }: { value?: string; onChange: (v: string) => void; disabled?: boolean }) {
 return (
  <Select value={value ?? 'unknown'} onValueChange={onChange} disabled={disabled}>
   <SelectTrigger className="w-40 h-8 text-sm">
    <SelectValue placeholder="Buying Role" />
   </SelectTrigger>
   <SelectContent>
    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
   </SelectContent>
  </Select>
 );
}
