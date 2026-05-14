'use client';

import { useParams } from 'next/navigation';
import { OutreachDraftEditor } from '@/components/outreach/OutreachDraftEditor';

export default function DraftPage() {
 const params = useParams();
 const campaignId = params.campaignId as string;
 const draftId = params.draftId as string;

 return <OutreachDraftEditor draftId={draftId} campaignId={campaignId} />;
}
