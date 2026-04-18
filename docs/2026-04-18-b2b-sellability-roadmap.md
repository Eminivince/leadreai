# LeadreAI B2B Sellability Roadmap

## Current Product Shape

Based on the current codebase, LeadreAI is already an AI-assisted prospecting and outreach engine:

- Natural-language prospecting query intake
- SERP, page, file, and OSINT-based enrichment
- Lead scoring, qualification, and deduplication
- Workspace-scoped campaigns
- Knowledge-base-backed outreach draft generation
- Manual draft approval and email sending

That is a strong core. The main commercial gap is that the product is still closer to a lead discovery tool plus draft writer than a full B2B revenue workflow platform.

---

## Product Modules To Add

### 1. Contact Intelligence

Move beyond company-level records into buyer-level records:

- named contacts
- job title
- seniority
- department
- role in buying committee
- contact-level confidence and freshness

Most B2B buyers pay for usable contacts, not just company entities.

### 2. CRM Sync

Add direct integrations with:

- HubSpot
- Salesforce
- Pipedrive
- Close

Expected sync scope:

- accounts
- contacts
- owners
- notes
- tasks
- activities
- opportunity status

Without CRM sync, many B2B teams will treat LeadreAI as a side tool instead of a system of action.

### 3. Sequence / Cadence Engine

Go beyond single draft generation and single-send execution:

- multi-step email sequences
- LinkedIn steps
- SMS steps
- send windows
- auto follow-ups
- stop rules
- retry rules
- queue scheduling

This turns the product from research software into outbound execution software.

### 4. Reply / Bounce / Unsubscribe Handling

Close the loop after sending:

- inbound reply classification
- bounce ingestion
- unsubscribe handling
- suppression list management
- lead status updates from delivery events

This is required for real campaign operations and accurate reporting.

### 5. Deliverability Workspace

Give each workspace sending controls and health visibility:

- SPF / DKIM / DMARC checks
- domain health checks
- inbox rotation
- daily send caps
- provider reputation monitoring
- warm-up support

Sellability increases sharply when the tool helps customers avoid burning domains.

### 6. Evidence-First Lead Cards

Make every lead explainable:

- why this company matched the query
- source evidence and snippets
- freshness timestamp
- verification history
- confidence breakdown
- qualification reasoning

This makes scraped and AI-processed data feel trustworthy to operators and managers.

### 7. Analytics and Attribution

Track business outcomes, not just generated records:

- positive reply rate
- bounce rate
- meeting-booked rate
- conversion by query
- conversion by campaign
- conversion by persona
- source-to-pipeline attribution
- eventual revenue influenced

This is where B2B clients start justifying spend internally.

### 8. Automation and Triggers

Support always-on workflows:

- saved searches
- scheduled refreshes
- trigger on new matching companies
- auto-enrich
- auto-qualify
- auto-sync to CRM
- auto-generate drafts
- notify owner in Slack or email

### 9. Vertical Packs

Package the product for specific buyer groups:

- agencies
- recruiting firms
- law firms
- accounting firms
- construction vendors
- SaaS outbound teams

Each pack should include:

- ICP templates
- qualification rules
- enrichment preferences
- messaging playbooks
- report templates

### 10. Buying Signals and Trigger Intelligence

Track events that make an account more likely to buy:

- hiring spikes
- job posts by function
- new office openings
- funding signals
- leadership changes
- technology changes
- compliance or certification updates
- website copy changes
- new partner announcements

This gives customers a reason to use LeadreAI continuously, not just when they need a static list.

### 11. Account Planning Workspace

Turn leads into target accounts with strategy attached:

- account summaries
- pain-point hypotheses
- stakeholder map
- outreach angles by persona
- objection map
- next best actions
- relationship notes

This makes the product more valuable for higher-ticket sales teams and ABM workflows.

### 12. TAM Builder and Territory Mapping

Help customers define and expand markets:

- market sizing by geography
- territory assignment
- whitespace detection
- ICP heatmaps
- segment comparison
- account clustering
- territory-based saved searches

This supports sales leaders, ops teams, and agency planners, not just SDRs.

### 13. Competitive Intelligence

Add a product line around market awareness:

- monitor competitor mentions
- detect new competitor clients
- track messaging changes
- compare positioning by market
- alert on competitor expansion into new geographies
- identify accounts using competitor-adjacent language

This opens a second wedge beyond simple lead generation.

### 14. Website Visitor and Intent Layer

For customers with enough traffic and acceptable compliance posture:

- identify likely company visitors
- score visit intent
- match visits to target accounts
- trigger enrichment for engaged accounts
- suggest outreach based on viewed pages

This ties prospecting to inbound behavior and increases urgency.

### 15. Proposal, Tender, and RFP Monitoring

Useful for agencies, consultancies, legal, government vendors, and construction:

- monitor tender portals
- detect public procurement notices
- extract key requirements from PDFs
- route opportunities by workspace
- generate response summaries
- create follow-up campaigns tied to opportunities

This fits well with your existing file extraction capabilities.

### 16. Local Market Discovery

Build a stronger wedge for SMB-heavy markets:

- local business discovery by city or radius
- branch and franchise mapping
- local competitor mapping
- service-area clustering
- underserved-zone detection
- local directory and association enrichment

This could become one of the clearest differentiated products for agencies.

### 17. Relationship and Warm Intro Graph

Reduce cold-start outreach:

- shared domains across accounts
- common association memberships
- partner overlap
- investor overlap
- alumni overlap
- mutual vendor or ecosystem clues
- probable warm-intro paths

Even partial signals here can materially improve reply rates.

### 18. Data Import, Cleanup, and Enrichment Studio

Let customers bring their own data and improve it:

- CSV and CRM import
- field mapping
- dedupe and merge rules
- enrichment-only runs
- stale-record refresh
- gap filling for missing fields
- confidence-based overwrite controls

This broadens LeadreAI from sourcing net-new leads to improving existing databases.

### 19. Collaborative Review and Approval Flows

Make the product usable by teams, not only solo operators:

- approval queues
- reviewer comments
- assign leads or campaigns to teammates
- lead ownership
- escalation rules
- manager sign-off before send
- activity feed per workspace

This is especially important for agencies and enterprise teams.

### 20. AI Prospecting Copilot

Add a conversational layer over the workspace:

- ask why a lead was qualified
- ask for better query suggestions
- ask for market summaries
- ask for missing fields to prioritize
- ask for next campaigns to launch
- ask for follow-up messaging options

This can become the most visible AI surface in the product.

### 21. Content Asset Generation

Expand beyond draft emails:

- call scripts
- voicemail scripts
- LinkedIn messages
- meeting prep briefs
- one-page account summaries
- personalized landing page copy
- proposal openers

This increases per-account value and supports more outbound roles.

### 22. Benchmarking and Scorecards

Show customers how they are performing relative to themselves and their segments:

- list quality benchmarks
- reply-rate benchmarks
- deliverability benchmarks
- campaign performance by team
- win-rate by segment
- data freshness score
- workspace health score

Scorecards make the product easier to justify to management.

### 23. Agency and White-Label Mode

Create a product specifically for service providers:

- client workspaces
- white-label portal
- branded exports
- client-ready dashboards
- permission-separated client access
- per-client billing and usage
- reusable campaign and ICP templates across clients

This is likely one of the fastest monetizable expansions.

### 24. Partner and Channel Sales Intelligence

Support companies selling through ecosystems:

- partner discovery
- reseller identification
- distributor mapping
- alliance tracking
- channel account segmentation
- ecosystem campaign templates

This creates a wedge outside standard SDR outbound.

---

## Platform Services To Support Enterprise Buyers

### Identity and Admin

- SSO / SAML
- SCIM
- finer RBAC
- approval workflows
- session controls
- admin audit visibility
- support impersonation

### Billing and Entitlements

- seat management
- credits and usage limits
- overage handling
- invoicing
- contract-aware enterprise plans

### Integration Platform

- public API
- workspace API keys
- outbound webhooks
- Zapier / Make / n8n support
- connector framework for future integrations

### Data Quality Service

- re-enrichment jobs
- freshness scoring
- stale lead detection
- duplicate merging across imports and syncs
- suppression and blacklist rules

### Eventing and Analytics Service

- normalized outbound events
- provider webhook ingestion
- campaign event timeline
- attribution-ready data model

### Compliance and Governance

- retention policies
- audit export
- delete / erase workflows
- suppression management
- regional privacy controls
- policy controls for outreach usage

### Ops and Observability

- queue health dashboards
- failed scrape review
- enrichment error reporting
- provider failure visibility
- model usage and cost tracking
- support diagnostics

### Knowledge and Prompt Management

- versioned workspace knowledge bases
- prompt experiments
- approval for prompt changes
- reusable messaging blocks
- campaign-level knowledge packs
- response quality review queues

### Revenue Ops Controls

- routing rules
- round-robin assignment
- ownership sync
- SLA timers
- lead disposition taxonomy
- meeting and opportunity backfill
- source quality scoring

### Marketplace and Extensions

- reusable query templates
- vertical pack install flow
- partner-built connectors
- enrichment providers as plug-ins
- export templates
- prompt libraries

### Security and Trust

- audit retention policies by plan
- customer-managed encryption options
- IP allowlists
- secret rotation
- security event logs
- vendor and source traceability
- workspace data residency controls

---

## Commercial Services To Offer

- CRM onboarding and field mapping
- deliverability setup and inbox/domain configuration
- outbound workflow implementation
- custom connector setup
- vertical-specific ICP and messaging configuration
- managed lead ops for larger clients
- security review and enterprise onboarding

These services increase close rate and expansion revenue even before the product is fully mature.

---

## Productized Offers

These are concrete offers you could sell as separate SKUs or plan add-ons.

### 1. LeadreAI Prospecting OS

Core product for outbound teams:

- natural-language search
- enrichment
- qualification
- campaign drafting
- exports and CRM sync

### 2. LeadreAI Enrichment API

API-first product for internal ops teams:

- company enrichment
- contact enrichment
- qualification scoring
- freshness checks
- webhook delivery

### 3. LeadreAI Agency Edition

Product for lead-gen agencies and consultancies:

- client workspaces
- white-label reporting
- reusable templates
- client approvals
- branded deliverables

### 4. LeadreAI Signal Monitor

Always-on trigger product:

- account change detection
- market alerts
- stakeholder change monitoring
- campaign triggers

### 5. LeadreAI RevOps Cleanup

Database quality product:

- stale lead refresh
- dedupe
- missing-field fill
- source confidence normalization
- CRM hygiene workflows

### 6. LeadreAI Local Market Intelligence

Focused product for SMB operators and agencies:

- city-based discovery
- franchise mapping
- local competitor tracking
- branch intelligence

### 7. LeadreAI Tender and Opportunity Watch

Product for firms that chase public or posted opportunities:

- tender discovery
- RFP extraction
- opportunity routing
- response prep support

### 8. LeadreAI ABM Workspace

Higher-end product for strategic sales teams:

- account planning
- stakeholder mapping
- buying-signal tracking
- multi-channel orchestration

---

## Features That Improve Sellability Fast

These are not necessarily the most technically ambitious. They are the ones most likely to help close deals sooner.

- CRM sync with HubSpot and Salesforce
- named contacts with title and seniority
- multi-step email sequence support
- bounce, reply, and unsubscribe handling
- white-label exports and client dashboards
- account evidence cards with source traceability
- deliverability checks and domain health
- Slack notifications and webhook automation
- saved searches and always-on alerts
- workspace API keys and public API
- role-based approvals for sending
- attribution from lead source to meeting booked

---

## Recommended Build Priority

1. Contact intelligence plus CRM sync
2. Sequence engine plus reply/bounce handling
3. Deliverability controls plus suppression/compliance basics
4. Analytics tied to replies, meetings, and pipeline outcomes
5. Enterprise admin, API, and broader integrations

### Expanded Horizon View

#### Horizon 1: Fastest Commercial Wins

- named contacts
- HubSpot sync
- multi-step sequences
- reply and bounce ingestion
- better lead evidence UI
- agency white-labeling

#### Horizon 2: Stickier Platform Value

- trigger intelligence
- automation workflows
- TAM and territory planning
- enrichment studio
- benchmarking and scorecards

#### Horizon 3: Higher-End Strategic Products

- ABM workspace
- signal monitor
- tender monitoring
- channel sales intelligence
- marketplace and extension ecosystem

---

## Now / Next / Later Roadmap

This is the more execution-oriented view of the roadmap.

### Now (0-6 Months)

Focus:

- make the product easier to buy
- make it usable every day
- make it credible for small B2B teams and agencies

Build:

- named contacts with title, department, and seniority
- HubSpot sync first
- basic multi-step email sequences
- reply, bounce, and unsubscribe handling
- stronger lead evidence cards and source traceability
- saved searches and always-on alerts
- deliverability basics: SPF / DKIM / DMARC checks and suppression lists
- workspace API keys, webhooks, and Slack notifications
- agency basics: white-label exports and client-ready reporting
- credits, billing scaffolding, and usage metering

Commercial outcome:

- close early agency and outbound-team customers
- reduce the “interesting demo, but not operational enough” objection
- create a cleaner path from prospecting to execution

### Next (6-12 Months)

Focus:

- improve retention
- expand into RevOps and team workflows
- move from point tool to system of record for outbound work

Build:

- Salesforce, Pipedrive, and Close integrations
- import, cleanup, dedupe, and re-enrichment studio
- buying-signal monitoring
- collaborative approvals and reviewer workflows
- attribution dashboards tied to replies, meetings, and opportunities
- TAM builder and territory planning
- local market intelligence packs
- agency portal with client workspaces and shared templates
- benchmark scorecards for list quality and campaign performance
- workflow automation for enrichment, assignment, and alerts

Commercial outcome:

- expand ACV with existing customers
- sell to managers and RevOps, not only operators
- make churn less likely by embedding into customer processes

### Later (12-24 Months)

Focus:

- move upmarket
- create differentiated product lines
- support enterprise procurement and larger contracts

Build:

- ABM workspace with account plans and stakeholder maps
- signal monitor as a standalone SKU
- website visitor and intent layer
- relationship graph and warm-intro intelligence
- tender / RFP monitoring
- channel and partner sales intelligence
- marketplace for connectors, templates, and vertical packs
- SSO / SAML / SCIM
- data residency, stronger audit, and enterprise trust controls
- custom connector framework and higher-end API products

Commercial outcome:

- support enterprise deals
- create multiple SKUs beyond core prospecting
- differentiate from simpler lead list and enrichment tools

---

## Best Initial ICP

LeadreAI currently looks strongest for:

- agencies
- outbound teams
- operators targeting web-visible SMB and local-service markets

It is less naturally positioned today for broad enterprise data coverage across all B2B categories. Narrowing the ICP first will make the roadmap easier to execute and easier to sell.

---

## Pricing-Packages Draft

This pricing draft assumes a hybrid model:

- platform fee for seats, workflows, and reporting
- usage-based credits for enrichment and signal-heavy actions
- higher-value features reserved for higher tiers

### Pricing Principles

- do not compete only on raw lead volume
- charge for workflow value, not just data access
- keep CRM sync, sequences, and analytics inside paid tiers
- keep agency and white-label features out of the entry tier
- reserve SSO, custom contracts, and advanced security for enterprise

### Draft Packages

| Package | Target Buyer | Draft Price | What It Includes |
|---|---|---:|---|
| Team | Small outbound teams | $349/mo | 3 seats, 2,500 monthly credits, core prospecting, lead qualification, exports, 1 CRM sync, basic sequences, saved searches |
| Growth | Serious outbound teams | $999/mo | 10 seats, 10,000 monthly credits, all Team features, reply/bounce tracking, webhooks, Slack alerts, deliverability basics, advanced reporting |
| Agency | Lead-gen agencies and consultancies | $1,999/mo | 15 internal seats, 25,000 monthly credits, white-label exports, client workspaces, approval flows, reusable templates, pooled usage |
| Enterprise | Larger B2B orgs | Custom, starting around $4,000-$8,000/mo | custom seats and usage, SSO/SAML, SCIM, audit export, security review support, API/SLA, custom integrations, data governance controls |

### Suggested Feature Gates

#### Team

- prospecting workspace
- company and contact enrichment
- qualification and ranking
- exports
- HubSpot sync only
- basic email sequencing
- simple dashboards

#### Growth

- multi-CRM support
- reply and bounce handling
- workflow automation
- better attribution reporting
- API keys and webhooks
- stronger deliverability controls
- team permissions and approvals

#### Agency

- multi-client workspaces
- white-label outputs
- client-facing reports
- usage pooling
- shared playbooks and templates
- branded exports and dashboards
- client approval flows

#### Enterprise

- SSO / SCIM
- advanced RBAC
- audit and retention controls
- custom connectors
- API and event access at scale
- security and procurement support
- custom onboarding and SLA

### Usage and Overage Draft

Use credits instead of exposing too many raw unit prices in the UI.

Suggested internal credit logic:

- basic company enrichment: 1 credit
- contact enrichment: 2-3 credits
- signal refresh: 1 credit
- heavy enrichment or file-based extraction: 3-5 credits
- AI-generated outreach draft: 1 credit

Suggested customer-facing overage pricing:

- Team: $99 per extra 1,000 credits
- Growth: $79 per extra 1,000 credits
- Agency: $59 per extra 1,000 credits
- Enterprise: negotiated volume pricing

### Add-Ons

These can increase ACV without forcing a full plan upgrade.

- Signal Monitor: $299-$999/mo depending on monitored account volume
- Enrichment API: from $500/mo plus usage
- Extra client workspace for agencies: $99-$199/mo
- Deliverability Pack: $199-$499/mo per sending setup
- White-label Portal: include in Agency or sell as a $300-$500/mo add-on
- Advanced attribution: $300-$800/mo for larger teams

### Services Pricing Draft

Keep services separate from SaaS pricing.

- onboarding and CRM mapping: $2,500-$7,500 one-time
- deliverability setup: $1,500-$5,000 one-time
- custom connector implementation: $3,000-$15,000 project-based
- managed lead ops / campaign operations: $3,000-$15,000 per month
- enterprise security and procurement support: bundled into larger annual contracts

### Packaging Recommendation

If launching soon, start with:

- Team
- Growth
- Agency
- Enterprise

This is cleaner than launching too many SKUs at once, and it matches your strongest likely buyers.
