'use client';

// The mail and WhatsApp row actions of a stage list (licence … invoice). A list
// spreads `messaging.actions(row.id)` into its DataTable actions and renders
// `messaging.dialog` once; the dialog fetches the composer pre-filled from the
// stage's manual communication template and the record's client contacts.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import ResultDialog from '@/components/ui/ResultDialog';
import MessageComposer from '@/modules/communications/MessageComposer';
import { safeFetchJson } from '@/lib/safeFetch';
import type { CommunicationStage } from '@/schemas/communicationTemplates';
import type { OutboundChannel } from '@/schemas/outboundMessages';
import type { StageDraft } from '@/db/queries/communicationTemplates';

interface Target {
  id: number;
  channel: OutboundChannel;
}

function RecordMessageDialog({ slug, target, onClose }: { slug: CommunicationStage; target: Target; onClose: () => void }) {
  const [draft, setDraft] = useState<StageDraft | null>(null);
  const [configured, setConfigured] = useState<Record<OutboundChannel, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams({ slug, id: String(target.id), channel: target.channel });
    void safeFetchJson<StageDraft>(`/api/v1/outbound-messages/draft?${p}`).then((res) => {
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDraft(res.data);
      setConfigured({
        email: res.meta?.email_configured === true,
        whatsapp: res.meta?.whatsapp_configured === true,
      });
    });
  }, [slug, target]);

  if (error) {
    return <ResultDialog result={{ status: 'error', title: 'Cannot write to the client', message: error }} onDismiss={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Send a message">
      {draft ? (
        <MessageComposer
          title={`${target.channel === 'email' ? 'Email' : 'WhatsApp'} — ${draft.record_label}`}
          initial={{ channel: draft.channel, to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message }}
          lockChannel
          link={{ entity_type: slug, entity_id: target.id, template_key: draft.template_key }}
          configured={configured}
          notes={draft.notes}
          onClose={onClose}
          className="flex max-h-[90vh] w-full max-w-3xl flex-col"
        />
      ) : (
        <div className="card px-6 py-4 text-sm text-muted-foreground">Preparing the message…</div>
      )}
    </div>
  );
}

export default function useRecordMessaging(slug: CommunicationStage): {
  actions: (id: number) => { email: () => void; whatsapp: () => void };
  dialog: ReactNode;
} {
  const [target, setTarget] = useState<Target | null>(null);
  const close = useCallback(() => setTarget(null), []);
  const actions = useCallback(
    (id: number) => ({
      email: () => setTarget({ id, channel: 'email' }),
      whatsapp: () => setTarget({ id, channel: 'whatsapp' }),
    }),
    [],
  );
  const dialog = useMemo(
    () => (target ? <RecordMessageDialog key={`${target.id}-${target.channel}`} slug={slug} target={target} onClose={close} /> : null),
    [slug, target, close],
  );
  return { actions, dialog };
}
