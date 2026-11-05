'use client';

// Communication → Live Chat, full screen. The same panel the corner button opens
// (modules/chat/ChatPanel), with the contact list and the conversation side by
// side. Access is the `/chat` menu grant, checked by every chat route.
import { MessageCircle } from 'lucide-react';
import ChatPanel from '@/modules/chat/ChatPanel';

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <MessageCircle className="h-6 w-6" /> Live Chat
      </h1>
      <div className="card flex h-[calc(100vh-14rem)] min-h-[24rem] flex-col overflow-hidden p-0">
        <ChatPanel variant="page" />
      </div>
    </div>
  );
}
