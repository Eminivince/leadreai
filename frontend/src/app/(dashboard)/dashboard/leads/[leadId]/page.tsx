'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, UserSearch, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactDrawer } from '@/components/contacts/ContactDrawer';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useContacts, useUpdateContact, useTriggerEnrichment, type Contact } from '@/hooks/useContacts';

export default function LeadContactsPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const { data, isLoading: contactsLoading } = useContacts(workspaceId, leadId);
  const updateContact = useUpdateContact(workspaceId);
  const triggerEnrichment = useTriggerEnrichment(workspaceId);

  const contacts = data?.data ?? [];
  const isLoading = wsLoading || contactsLoading;

  const handleBuyingRoleChange = (contactId: string, role: string) => {
    updateContact.mutate(
      { contactId, data: { buyingRole: role } },
      {
        onSuccess: () => toast.success('Buying role updated'),
        onError: () => toast.error('Failed to update buying role'),
      }
    );
  };

  const handleSaveContact = (contactId: string, data: { notes?: string; buyingRole?: string }) => {
    updateContact.mutate(
      { contactId, data },
      {
        onSuccess: () => toast.success('Contact saved'),
        onError: () => toast.error('Failed to save contact'),
      }
    );
  };

  const handleEnrich = async () => {
    if (!leadId) return;
    try {
      await triggerEnrichment.mutateAsync(leadId);
      toast.success('Contact enrichment started');
    } catch {
      toast.error('Failed to start enrichment');
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/leads">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Contacts</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLoading ? 'Loading…' : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
        </div>
        <Button
          onClick={handleEnrich}
          disabled={triggerEnrichment.isPending}
          size="sm"
          className="gap-2 self-start sm:self-auto"
        >
          {triggerEnrichment.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserSearch className="w-4 h-4" />
          )}
          Run Contact Enrichment
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-16 text-center">
          <UserSearch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No contacts found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click &ldquo;Run Contact Enrichment&rdquo; to discover contacts for this lead.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map(contact => (
            <ContactCard
              key={contact._id}
              contact={contact}
              onBuyingRoleChange={handleBuyingRoleChange}
              onSelect={setSelectedContact}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <ContactDrawer
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onSave={handleSaveContact}
      />
    </div>
  );
}
