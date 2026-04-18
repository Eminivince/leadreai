'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface ContactEmail { address: string; type: string; confidence: number; verified: boolean; source: string; }
interface ContactPhone { normalized: string; type: string; source: string; }

export interface Contact {
  _id: string;
  workspaceId: string;
  leadId?: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  seniority?: 'c_level' | 'vp' | 'director' | 'manager' | 'ic' | 'unknown';
  linkedinUrl?: string;
  avatarUrl?: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  buyingRole?: string;
  confidenceScore: number;
  freshnessScore: number;
  isActive: boolean;
  tags: string[];
  notes?: string;
  createdAt: string;
}

interface ContactsResponse { success: true; data: { data: Contact[]; total: number; page: number; limit: number } }

export function useContacts(workspaceId: string | null, leadId?: string) {
  return useQuery({
    queryKey: ['contacts', workspaceId, leadId],
    queryFn: async () => {
      const url = `/api/v1/workspaces/${workspaceId}/contacts${leadId ? `?leadId=${leadId}` : ''}`;
      const res = await apiFetch<ContactsResponse>(url);
      return res.data;
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateContact(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: { notes?: string; tags?: string[]; buyingRole?: string } }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts', workspaceId] }),
  });
}

export function useTriggerEnrichment(workspaceId: string | null) {
  return useMutation({
    mutationFn: async (leadId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/leads/${leadId}/enrich-contacts`, { method: 'POST' }),
  });
}
