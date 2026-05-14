'use client';
import { useState, useEffect } from 'react';
import { X, Mail, Phone, Linkedin, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SeniorityBadge } from './SeniorityBadge';
import { BuyingRoleSelector } from './BuyingRoleSelector';
import type { Contact } from '@/hooks/useContacts';

interface ContactDrawerProps {
 contact: Contact | null;
 onClose: () => void;
 onSave?: (contactId: string, data: { notes?: string; buyingRole?: string }) => void;
}

export function ContactDrawer({ contact, onClose, onSave }: ContactDrawerProps) {
 const [notes, setNotes] = useState(contact?.notes ?? '');
 const [buyingRole, setBuyingRole] = useState(contact?.buyingRole ?? 'unknown');

 // Reset form state when the drawer's contact identity changes. We
 // intentionally key on `contact?._id` rather than the full `contact`
 // object so a re-fetch (same id, mutated reference) doesn't clobber
 // the user's in-progress edits in the drawer fields.
 useEffect(() => {
  if (contact) {
   setNotes(contact.notes ?? '');
   setBuyingRole(contact.buyingRole ?? 'unknown');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [contact?._id]);

 if (!contact) return null;
 const initials = contact.fullName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';

 return (
  <>
   <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
   <div className="fixed right-0 top-0 h-full w-[420px] bg-[color:var(--paper)] shadow-2xl z-50 flex flex-col">
    {/* Header */}
    <div className="flex items-start justify-between p-6 border-b">
     <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
       {initials}
      </div>
      <div>
       <div className="font-semibold text-base">{contact.fullName}</div>
       {contact.title && <div className="text-sm text-muted-foreground">{contact.title}</div>}
       <div className="mt-1"><SeniorityBadge seniority={contact.seniority} /></div>
      </div>
     </div>
     <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
    </div>

    {/* Body */}
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
     {/* Emails */}
     {contact.emails.length > 0 && (
      <div>
       <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Emails</div>
       <div className="space-y-2">
        {contact.emails.map((e, i) => (
         <div key={i} className="flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>{e.address}</span>
          <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
          <span className="text-xs text-muted-foreground">{(e.confidence * 100).toFixed(0)}%</span>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* Phones */}
     {contact.phones.length > 0 && (
      <div>
       <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Phones</div>
       {contact.phones.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
         <Phone className="w-4 h-4 text-muted-foreground" />
         <span>{p.normalized}</span>
         <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
        </div>
       ))}
      </div>
     )}

     {/* LinkedIn */}
     {contact.linkedinUrl && (
      <div>
       <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">LinkedIn</div>
       <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
        <Linkedin className="w-4 h-4" />
        {contact.linkedinUrl.replace('https://www.', '').replace('https://', '')}
        <ExternalLink className="w-3 h-3" />
       </a>
      </div>
     )}

     {/* Tags */}
     {contact.tags.length > 0 && (
      <div>
       <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags</div>
       <div className="flex flex-wrap gap-1.5">
        {contact.tags.map(t => <Badge key={t} variant="secondary" className="text-xs"><Tag className="w-3 h-3 mr-1" />{t}</Badge>)}
       </div>
      </div>
     )}

     {/* Buying Role */}
     <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Buying Role</div>
      <BuyingRoleSelector value={buyingRole} onChange={setBuyingRole} />
     </div>

     {/* Notes */}
     <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</div>
      <Textarea
       value={notes}
       onChange={e => setNotes(e.target.value)}
       placeholder="Add notes about this contact..."
       rows={4}
       className="text-sm"
      />
     </div>
    </div>

    {/* Footer */}
    <div className="p-4 border-t flex justify-end gap-2">
     <Button variant="outline" onClick={onClose}>Cancel</Button>
     <Button onClick={() => { onSave?.(contact._id, { notes, buyingRole }); onClose(); }}>Save</Button>
    </div>
   </div>
  </>
 );
}
