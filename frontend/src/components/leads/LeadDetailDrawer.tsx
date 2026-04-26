'use client';

import { X, Globe, Mail, Phone, Linkedin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Lead {
  _id: string;
  companyName: string;
  companyDomain?: string;
  industry?: string;
  website?: string;
  address?: { city?: string; state?: string; country?: string };
  emails: Array<{ address: string; type: string; confidence: number; source: string }>;
  phones: Array<{ raw: string; normalized?: string; type?: string }>;
  socialProfiles?: { linkedinUrl?: string };
  osint?: Record<string, unknown>;
  sources: Array<{ url: string; type: string }>;
  rankScore: number;
  completenessScore: number;
  isDuplicate: boolean;
  outreachStatus: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  contactSummary?: {
    totalContacts: number;
    topContact?: { fullName: string; title: string; seniority: string };
  };
}

interface LeadDetailDrawerProps {
  lead: Lead | null;
  onClose: () => void;
}

export function LeadDetailDrawer({ lead, onClose }: LeadDetailDrawerProps) {
  if (!lead) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border z-50 overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground truncate">{lead.companyName}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic info */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company</h3>
            <div className="space-y-2 text-sm">
              {lead.industry && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Industry:</span> {lead.industry}
                </p>
              )}
              {lead.address?.country && (
                <p className="text-foreground">
                  <span className="text-muted-foreground">Location:</span>{' '}
                  {[lead.address.city, lead.address.country].filter(Boolean).join(', ')}
                </p>
              )}
              {lead.website && (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
                >
                  <Globe size={13} /> {lead.website}
                </a>
              )}
              {lead.socialProfiles?.linkedinUrl && (
                <a
                  href={lead.socialProfiles.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
                >
                  <Linkedin size={13} /> LinkedIn
                </a>
              )}
            </div>
          </section>

          {/* Emails */}
          {lead.emails.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emails</h3>
              <div className="space-y-2">
                {lead.emails.map((email, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">{email.address}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-xs">{email.type}</Badge>
                      <span className="text-xs text-muted-foreground">{Math.round(email.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Phones */}
          {lead.phones.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phones</h3>
              <div className="space-y-2">
                {lead.phones.map((phone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Phone size={13} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">{phone.normalized ?? phone.raw}</span>
                    {phone.type && <Badge variant="secondary" className="text-xs">{phone.type}</Badge>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* OSINT */}
          {lead.osint && Object.keys(lead.osint).length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OSINT</h3>
              <div className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground font-mono overflow-auto max-h-48">
                <pre>{JSON.stringify(lead.osint, null, 2)}</pre>
              </div>
            </section>
          )}

          {/* Scores */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scores</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{lead.rankScore}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rank Score</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{lead.completenessScore}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Completeness</div>
              </div>
            </div>
          </section>

          {/* Sources */}
          {lead.sources.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sources ({lead.sources.length})
              </h3>
              <div className="space-y-1">
                {lead.sources.slice(0, 5).map((src, i) => (
                  <p key={i} className="text-xs text-muted-foreground truncate">
                    {src.type}: {src.url}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Contacts summary */}
          {lead.contactSummary?.totalContacts ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contacts</h3>
              <div className="text-sm text-foreground">{lead.contactSummary.totalContacts} contacts found</div>
              {lead.contactSummary.topContact && (
                <div className="text-xs text-muted-foreground">
                  Top: {lead.contactSummary.topContact.fullName} · {lead.contactSummary.topContact.title}
                </div>
              )}
              <Link href={`/dashboard/leads/${lead._id}`} className="text-xs text-indigo-600 hover:underline block">
                View all contacts →
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
