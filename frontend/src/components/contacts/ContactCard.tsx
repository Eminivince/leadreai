'use client';
import { Mail, Linkedin, ExternalLink } from 'lucide-react';
import { SeniorityBadge } from './SeniorityBadge';
import { BuyingRoleSelector } from './BuyingRoleSelector';
import { Button } from '@/components/ui/button';
import type { Contact } from '@/hooks/useContacts';

interface ContactCardProps {
 contact: Contact;
 onBuyingRoleChange?: (contactId: string, role: string) => void;
 onSelect?: (contact: Contact) => void;
}

export function ContactCard({ contact, onBuyingRoleChange, onSelect }: ContactCardProps) {
 const initials = contact.fullName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
 const topEmail = contact.emails[0];

 return (
  <div className="border rounded-lg p-4 bg-[color:var(--paper)] hover:shadow-sm transition-shadow cursor-pointer" onClick={() => onSelect?.(contact)}>
   <div className="flex items-start justify-between gap-3">
    <div className="flex items-center gap-3">
     <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
      {initials}
     </div>
     <div>
      <div className="font-medium text-sm">{contact.fullName}</div>
      {contact.title && (
       <div className="text-xs text-muted-foreground">
        {contact.title}{contact.department ? ` · ${contact.department}` : ''}
       </div>
      )}
     </div>
    </div>
    <SeniorityBadge seniority={contact.seniority} />
   </div>

   {(topEmail || contact.linkedinUrl) && (
    <div className="mt-3 pt-3 border-t space-y-1.5">
     {topEmail && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
       <Mail className="w-3 h-3 flex-shrink-0" />
       <span className="truncate">{topEmail.address}</span>
       <span className="text-[10px] opacity-60">({topEmail.type}, {(topEmail.confidence * 100).toFixed(0)}%)</span>
      </div>
     )}
     {contact.linkedinUrl && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
       <Linkedin className="w-3 h-3 flex-shrink-0" />
       <span className="truncate flex-1">{contact.linkedinUrl.replace('https://', '')}</span>
       <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); window.open(contact.linkedinUrl, '_blank'); }}>
        <ExternalLink className="w-3 h-3" />
       </Button>
      </div>
     )}
    </div>
   )}

   <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
    <span className="text-xs text-muted-foreground">Buying Role:</span>
    <BuyingRoleSelector
     value={contact.buyingRole}
     onChange={role => onBuyingRoleChange?.(contact._id, role)}
    />
   </div>
  </div>
 );
}
