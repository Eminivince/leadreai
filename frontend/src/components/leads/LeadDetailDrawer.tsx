'use client';

import { useState } from 'react';
import { X, Globe, Mail, Phone, Linkedin, Sparkles, AlertTriangle } from 'lucide-react';
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
 /** AI-generated one-line justification from the post-hoc grader —
  * "why this lead qualified". */
 qualificationReason?: string;
 qualificationScore?: number;
 /** Research agent's own rationale captured at `write_lead` time —
  * "why I'm emitting this lead". Complements qualificationReason. */
 agentReasoning?: string;
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
     {/* AI justification — always first so the reader sees WHY
       before they see the data. When neither reason is present
       (e.g. a manually-inserted lead) we render a quiet
       placeholder so the section stays anchored and the layout
       doesn't jump as users page through leads. */}
     <LeadJustification lead={lead} />

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

     {/* Emails — found vs. inferred. Inferred = pattern-guessed, never seen
       in a public source. Hidden by default so users don't mistake guesses
       for real contact data. */}
     <EmailsSection emails={lead.emails} />


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
      {typeof lead.qualificationScore === 'number' && (
       <div className="rounded-lg bg-secondary/50 p-3">
        <div className="flex items-baseline gap-2 mb-1">
         <span className="text-2xl font-bold text-foreground">
          {Math.round(lead.qualificationScore * 100)}%
         </span>
         <span className="text-xs text-muted-foreground">AI Score</span>
        </div>
        {lead.qualificationReason && (
         <p className="text-xs text-muted-foreground leading-relaxed">
          {lead.qualificationReason}
         </p>
        )}
       </div>
      )}
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

/**
 * Top-of-drawer "Why this lead" block. Renders up to two AI-authored
 * justifications — the research agent's commit-time reason and the
 * grader's qualification reason — plus a compact evidence strip
 * summarizing the top source URLs.
 *
 * Shows a muted placeholder when no reasons are available (e.g.
 * manually-inserted leads or pre-pivot records from before the
 * `agentReasoning` / `qualificationReason` fields existed). This
 * keeps the drawer layout stable across leads instead of collapsing
 * to reveal different sections above the fold.
 */
function LeadJustification({ lead }: { lead: Lead }) {
 const hasAgent = Boolean(lead.agentReasoning && lead.agentReasoning.trim());
 const topSources = (lead.sources ?? []).slice(0, 3);

 // Placeholder — still visually anchors the section, doesn't leave
 // the drawer feeling like it's missing something.
 if (!hasAgent) {
  return (
   <section className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
    <div className="flex items-center gap-2 mb-1">
     <Sparkles size={13} className="text-muted-foreground" />
     <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Why this lead
     </h3>
    </div>
    <p className="text-xs text-muted-foreground italic">
     No AI justification recorded — this lead was added before reasoning was captured, or imported manually.
    </p>
   </section>
  );
 }

 return (
  <section className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
   <div className="flex items-center gap-2">
    <Sparkles size={13} className="text-foreground" />
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
     Why this lead
    </h3>
   </div>

   {hasAgent && (
    <p className="text-sm text-foreground leading-relaxed">
     {lead.agentReasoning}
    </p>
   )}

   {topSources.length > 0 && (
    <div className="pt-2 border-t border-border/60">
     <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
      Evidence
     </div>
     <ul className="space-y-1">
      {topSources.map((s, i) => (
       <li key={i} className="flex items-baseline gap-2 min-w-0">
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
         {s.type}
        </span>
        <a
         href={s.url}
         target="_blank"
         rel="noopener noreferrer"
         className="text-xs text-foreground hover:underline truncate min-w-0"
         title={s.url}
        >
         {s.url}
        </a>
       </li>
      ))}
     </ul>
    </div>
   )}
  </section>
 );
}

/**
 * Email list with honest provenance.
 *
 * `pattern_inferred` = guessed from a likely company email pattern, never
 * seen in any public source. We hide these by default behind a toggle so
 * a user reading the drawer doesn't read a guess as a confirmed contact.
 *
 * Real emails (business / generic / personal) render with a semantic
 * type label, no confidence percentage — the percentage was misleading
 * because pattern_inferred (a literal guess) read identically to a
 * scraped contact-page email at the same numeric value.
 */
function EmailsSection({
 emails,
}: {
 emails: Array<{ address: string; type: string; confidence: number; source: string }>;
}) {
 const [showInferred, setShowInferred] = useState(false);
 const real = emails.filter((e) => e.type !== 'pattern_inferred');
 const inferred = emails.filter((e) => e.type === 'pattern_inferred');

 if (real.length === 0 && inferred.length === 0) return null;

 return (
  <section className="space-y-3">
   <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emails</h3>

   {real.length > 0 ? (
    <div className="space-y-2">
     {real.map((email, i) => (
      <div key={i} className="flex items-center justify-between gap-2">
       <div className="flex items-center gap-2 min-w-0">
        <Mail size={13} className="text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground truncate">{email.address}</span>
       </div>
       <Badge variant="secondary" className="text-xs shrink-0 capitalize">
        {email.type}
       </Badge>
      </div>
     ))}
    </div>
   ) : (
    <p className="text-xs text-muted-foreground italic">
     No verified email found in any public source.
    </p>
   )}

   {inferred.length > 0 && (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
     <button
      type="button"
      onClick={() => setShowInferred((v) => !v)}
      className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 hover:underline"
     >
      <AlertTriangle size={12} />
      {showInferred
       ? `Hide ${inferred.length} inferred guess${inferred.length === 1 ? '' : 'es'}`
       : `Show ${inferred.length} inferred email guess${inferred.length === 1 ? '' : 'es'}`}
     </button>
     {showInferred && (
      <>
       <p className="text-[11px] text-muted-foreground leading-relaxed">
        These addresses were not found in any public source. They were guessed
        from the company&rsquo;s likely email pattern (e.g.{' '}
        <code className="font-mono text-[10px]">firstname.lastname@domain</code>).
        Verify before using.
       </p>
       <div className="space-y-1.5 pt-1">
        {inferred.map((email, i) => (
         <div key={i} className="flex items-center gap-2 min-w-0">
          <Mail size={11} className="text-amber-600 dark:text-amber-500 shrink-0" />
          <span className="text-xs text-foreground/80 truncate">{email.address}</span>
         </div>
        ))}
       </div>
      </>
     )}
    </div>
   )}
  </section>
 );
}
