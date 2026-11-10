'use client';

// AI Search, full screen: a conversation with the assistant, with the person's
// saved chats beside it. The header box asks single questions and hands off
// here to continue them (§4.10 — both share useAiSearch and AiAnswer).
import { Suspense } from 'react';
import AiChat from '@/modules/ai-search/AiChat';

export default function AskPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <AiChat />
    </Suspense>
  );
}
