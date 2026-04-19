'use client';

import dynamic from 'next/dynamic';

const CreateCampaignPageInner = dynamic(
  () => import('./_CreateCampaignPage'),
  { ssr: false }
);

export default function CreateCampaignPage() {
  return <CreateCampaignPageInner />;
}
