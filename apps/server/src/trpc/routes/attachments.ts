import { privateProcedure, router } from '../trpc';
import { z } from 'zod';
import { email } from '../../db/schema';
import { eq, sql, and, isNotNull } from 'drizzle-orm';

interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId: string | null;
}

interface AttachmentWithEmail {
  id: string;
  filename: string;
  mimeType: string; // Changed from contentType to match frontend
  size: number;
  contentId: string | null;
  threadId: string; // Changed from emailId to match frontend
  subject: string | null;
  from: { name?: string; address: string };
  date: Date; // Changed from internalDate to match frontend
}

function categorizeAttachment(contentType: string): 'images' | 'documents' | 'spreadsheets' | 'other' {
  if (contentType.startsWith('image/')) return 'images';
  if (
    contentType.includes('pdf') ||
    contentType.includes('word') ||
    contentType.includes('document') ||
    contentType.includes('text/')
  )
    return 'documents';
  if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('csv'))
    return 'spreadsheets';
  return 'other';
}

export const attachmentsRouter = router({
  getAllAttachments: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
        fileType: z.enum(['all', 'images', 'documents', 'spreadsheets', 'other']).default('all'),
        limit: z.number().default(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { connectionId, fileType, limit } = input;

      // Query emails that have attachments (non-null and non-empty array)
      const emails = await ctx.db
        .select({
          id: email.id,
          subject: email.subject,
          from: email.from,
          internalDate: email.internalDate,
          attachments: email.attachments,
        })
        .from(email)
        .where(
          and(
            eq(email.connectionId, connectionId),
            isNotNull(email.attachments),
            sql`jsonb_array_length(${email.attachments}) > 0`,
          ),
        )
        .orderBy(sql`${email.internalDate} DESC`)
        .limit(limit * 2); // Fetch more since we'll filter by fileType

      // Flatten attachments from all emails
      const allAttachments: AttachmentWithEmail[] = [];
      for (const e of emails) {
        const attachments = (e.attachments as Attachment[]) || [];
        for (const att of attachments) {
          const category = categorizeAttachment(att.contentType);

          // Filter by fileType if specified
          if (fileType !== 'all' && category !== fileType) continue;

          allAttachments.push({
            id: att.id,
            filename: att.filename,
            mimeType: att.contentType, // Map contentType to mimeType
            size: att.size,
            contentId: att.contentId,
            threadId: e.id, // Map emailId to threadId for frontend
            subject: e.subject,
            from: e.from as { name?: string; address: string },
            date: e.internalDate, // Map internalDate to date for frontend
          });
        }
      }

      // Return limited results
      return allAttachments.slice(0, limit);
    }),

  getAttachmentStats: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { connectionId } = input;

      // Query all emails with attachments (non-null and non-empty array)
      const emails = await ctx.db
        .select({
          attachments: email.attachments,
        })
        .from(email)
        .where(
          and(
            eq(email.connectionId, connectionId),
            isNotNull(email.attachments),
            sql`jsonb_array_length(${email.attachments}) > 0`,
          ),
        );

      const stats = {
        total: 0,
        images: 0,
        documents: 0,
        spreadsheets: 0,
        other: 0,
        totalSize: 0,
      };

      for (const e of emails) {
        const attachments = (e.attachments as Attachment[]) || [];
        for (const att of attachments) {
          stats.total++;
          stats.totalSize += att.size || 0;

          const category = categorizeAttachment(att.contentType);
          stats[category]++;
        }
      }

      return stats;
    }),
});
