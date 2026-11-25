/**
 * Sends a ticket's attachments after the ticket or the reply is saved (TICKETS-1). Usually one
 * multipart request; a set over the server's request size goes in more than one (lib/support.ts
 * `uploadGroups`). `messageId` puts the files under that reply.
 */
import { supportAPI } from '@/services/api';
import { uploadGroups, type Attachment } from '@/lib/support';

export async function sendAttachments(ticketId: string, items: Attachment[], messageId?: string): Promise<void> {
  for (const group of uploadGroups(items)) {
    await supportAPI.uploadFiles(ticketId, group.map((a) => ({ field: a.field, blob: a.blob, name: a.name })), messageId);
  }
}
