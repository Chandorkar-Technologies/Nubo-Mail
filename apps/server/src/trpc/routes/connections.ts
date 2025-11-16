import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';
import { getActiveConnection, getZeroDB } from '../../lib/server-utils';
import { ImapMailManager } from '../../lib/driver/imap';
import { Ratelimit } from '@upstash/ratelimit';
import { TRPCError } from '@trpc/server';
import { CFImap } from 'cf-imap';
import { z } from 'zod';
import { ulid } from 'ulid';

export const connectionsRouter = router({
  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(120, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:get-connections-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);
      const connections = await db.findManyConnections();

      const disconnectedIds = connections
        .filter((c) => !c.accessToken || !c.refreshToken)
        .map((c) => c.id);

      return {
        connections: connections.map((connection) => {
          return {
            id: connection.id,
            email: connection.email,
            name: connection.name,
            picture: connection.picture,
            createdAt: connection.createdAt,
            providerId: connection.providerId,
          };
        }),
        disconnectedIds,
      };
    }),
  setDefault: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = await getZeroDB(user.id);
      const foundConnection = await db.findUserConnection(connectionId);
      if (!foundConnection) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.updateUser({ defaultConnectionId: connectionId });
    }),
  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = await getZeroDB(user.id);
      await db.deleteConnection(connectionId);

      const activeConnection = await getActiveConnection();
      if (connectionId === activeConnection.id) await db.updateUser({ defaultConnectionId: null });
    }),
  getDefault: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionUser) return null;
    const connection = await getActiveConnection();
    return {
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
    };
  }),

  // IMAP-specific endpoints
  testImap: privateProcedure
    .input(
      z.object({
        host: z.string(),
        port: z.number().default(993),
        tls: z.boolean().default(true),
        username: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const imap = new CFImap({
          host: input.host,
          port: input.port,
          tls: input.tls,
          auth: {
            username: input.username,
            password: input.password,
          },
        });

        await imap.connect();
        await imap.logout();

        return { success: true, message: 'IMAP connection successful' };
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `IMAP connection failed: ${error.message || 'Unknown error'}`,
        });
      }
    }),

  createImap: privateProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        imapHost: z.string(),
        imapPort: z.number().default(993),
        imapSecure: z.boolean().default(true),
        smtpHost: z.string().optional(),
        smtpPort: z.number().default(587).optional(),
        smtpSecure: z.boolean().default(true).optional(),
        username: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);

      // Test connection first
      try {
        const imap = new CFImap({
          host: input.imapHost,
          port: input.imapPort,
          tls: input.imapSecure,
          auth: {
            username: input.username,
            password: input.password,
          },
        });

        await imap.connect();
        await imap.logout();
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `IMAP connection test failed: ${error.message || 'Unknown error'}`,
        });
      }

      // Create connection in database
      const connectionId = ulid();
      const imapConfigId = ulid();

      // TODO: Encrypt password using Autumn encryption service
      const encryptedPassword = input.password; // Placeholder - should be encrypted

      await db.createConnection({
        id: connectionId,
        userId: sessionUser.id,
        email: input.email,
        name: input.name || input.email,
        picture: null,
        accessToken: null,
        refreshToken: null,
        scope: 'imap',
        providerId: 'imap',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create IMAP config
      await db.createImapConfig({
        id: imapConfigId,
        connectionId,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        smtpHost: input.smtpHost || null,
        smtpPort: input.smtpPort || null,
        smtpSecure: input.smtpSecure ?? null,
        username: input.username,
        encryptedPassword,
        lastSyncUidvalidity: null,
        lastSyncUid: null,
        folderStructure: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        connectionId,
        message: 'IMAP account added successfully',
      };
    }),

  updateImap: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
        imapHost: z.string().optional(),
        imapPort: z.number().optional(),
        imapSecure: z.boolean().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpSecure: z.boolean().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);

      const connection = await db.findUserConnection(input.connectionId);
      if (!connection) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });
      }

      if (connection.providerId !== 'imap') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Connection is not an IMAP account' });
      }

      // Update IMAP config
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.imapHost) updateData.imapHost = input.imapHost;
      if (input.imapPort !== undefined) updateData.imapPort = input.imapPort;
      if (input.imapSecure !== undefined) updateData.imapSecure = input.imapSecure;
      if (input.smtpHost) updateData.smtpHost = input.smtpHost;
      if (input.smtpPort !== undefined) updateData.smtpPort = input.smtpPort;
      if (input.smtpSecure !== undefined) updateData.smtpSecure = input.smtpSecure;
      if (input.username) updateData.username = input.username;
      if (input.password) {
        // TODO: Encrypt password
        updateData.encryptedPassword = input.password;
      }

      await db.updateImapConfig(input.connectionId, updateData);

      return {
        success: true,
        message: 'IMAP configuration updated successfully',
      };
    }),

  getImapConfig: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);

      const connection = await db.findUserConnection(input.connectionId);
      if (!connection) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });
      }

      if (connection.providerId !== 'imap') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Connection is not an IMAP account' });
      }

      const imapConfig = await db.getImapConfig(input.connectionId);
      if (!imapConfig) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'IMAP configuration not found' });
      }

      // Don't return the encrypted password
      return {
        id: imapConfig.id,
        connectionId: imapConfig.connectionId,
        imapHost: imapConfig.imapHost,
        imapPort: imapConfig.imapPort,
        imapSecure: imapConfig.imapSecure,
        smtpHost: imapConfig.smtpHost,
        smtpPort: imapConfig.smtpPort,
        smtpSecure: imapConfig.smtpSecure,
        username: imapConfig.username,
        lastSyncUidvalidity: imapConfig.lastSyncUidvalidity,
        lastSyncUid: imapConfig.lastSyncUid,
        folderStructure: imapConfig.folderStructure,
      };
    }),
});
