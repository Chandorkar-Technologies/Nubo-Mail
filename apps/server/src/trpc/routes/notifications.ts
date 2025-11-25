import { privateProcedure, router } from '../trpc';
import { getZeroDB, getZeroAgent } from '../../lib/server-utils';
import { z } from 'zod';
import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../../ctx';

interface Notification {
  id: string;
  threadId: string;
  messageId: string;
  type: 'mention' | 'important' | 'action_item';
  title: string;
  snippet: string;
  from: any;
  date: Date;
  read: boolean;
  connectionId: string;
}

export const notificationsRouter = router({
  getNotifications: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
        types: z.array(z.enum(['mention', 'important', 'action_item'])).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const { connectionId, types, limit } = input;
      const { sessionUser } = ctx;

      // Get connection from Durable Object
      const db = await getZeroDB(sessionUser.id);
      const connection = await db.findUserConnection(connectionId);

      if (!connection) {
        throw new Error('Connection not found');
      }

      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(connectionId, executionCtx);

      // Query threads from agent's database
      const threads = await agent.db.query.threads.findMany({
        where: (thread: any, { eq }: any) => eq(thread.providerId, connectionId),
        orderBy: (thread: any, { desc }: any) => desc(thread.latestReceivedOn),
        limit: 200,
      });

      const notifications: Notification[] = [];
      const processedThreads = new Set<string>();

      // Process threads to find notifications
      for (const thread of threads) {
        if (processedThreads.has(thread.id)) continue;
        processedThreads.add(thread.id);

        const subject = (thread.subject || '').toLowerCase();
        const snippet = thread.snippet || '';

        const notificationTypes: Array<'mention' | 'important' | 'action_item'> = [];

        // Check for important keywords
        if (!types || types.includes('important')) {
          const importantKeywords = ['urgent', 'asap', 'important', 'critical', 'deadline', 'priority'];
          if (importantKeywords.some(keyword => subject.includes(keyword))) {
            notificationTypes.push('important');
          }
        }

        // Check for action items
        if (!types || types.includes('action_item')) {
          const actionKeywords = ['please', 'could you', 'can you', 'action required', 'review', 'approve'];
          if (actionKeywords.some(keyword => subject.includes(keyword))) {
            notificationTypes.push('action_item');
          }
        }

        // Create notifications
        for (const type of notificationTypes) {
          notifications.push({
            id: `${thread.id}-${type}`,
            threadId: thread.id,
            messageId: thread.latestId || thread.id,
            type,
            title: thread.subject || '(No subject)',
            snippet,
            from: {
              name: thread.latestSender?.name,
              address: thread.latestSender?.email || '',
            },
            date: new Date(thread.latestReceivedOn || Date.now()),
            read: false,
            connectionId,
          });
        }

        if (notifications.length >= limit) {
          break;
        }
      }

      return notifications
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, limit);
    }),

  getNotificationCounts: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { connectionId } = input;
      const { sessionUser } = ctx;

      // Get connection from Durable Object
      const db = await getZeroDB(sessionUser.id);
      const connection = await db.findUserConnection(connectionId);

      if (!connection) {
        throw new Error('Connection not found');
      }

      let mentionCount = 0;
      let importantCount = 0;
      let actionItemCount = 0;

      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(connectionId, executionCtx);

      // Query threads from agent's database
      const threads = await agent.db.query.threads.findMany({
        where: (thread: any, { eq }: any) => eq(thread.providerId, connectionId),
        orderBy: (thread: any, { desc }: any) => desc(thread.latestReceivedOn),
        limit: 200,
      });

      const processedThreads = new Set<string>();

      for (const thread of threads) {
        if (processedThreads.has(thread.id)) continue;
        processedThreads.add(thread.id);

        const subject = (thread.subject || '').toLowerCase();

        // Count important
        const importantKeywords = ['urgent', 'asap', 'important', 'critical', 'deadline', 'priority'];
        if (importantKeywords.some(keyword => subject.includes(keyword))) {
          importantCount++;
        }

        // Count action items
        const actionKeywords = ['please', 'could you', 'can you', 'action required', 'review', 'approve'];
        if (actionKeywords.some(keyword => subject.includes(keyword))) {
          actionItemCount++;
        }
      }

      return {
        mentions: mentionCount,
        important: importantCount,
        actionItems: actionItemCount,
        total: mentionCount + importantCount + actionItemCount,
      };
    }),
});
