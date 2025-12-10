/**
 * Workspace Router
 * Handles all workspace/organization dashboard operations including:
 * - Organization dashboard
 * - Domain management
 * - User management
 * - Storage allocation to users
 * - Invoice viewing
 * - Pro subscription management
 */

import { privateProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq, and, desc, asc, count, or, like } from 'drizzle-orm';
import {
  organization,
  organizationDomain,
  organizationUser,
  planCategory,
  planVariant,
  invoice,
  invoiceLineItem,
  approvalRequest,
  emailArchival,
  user,
  account,
} from '../../db/schema';
import { mailcowApi } from '../../lib/mailcow';
import { verifyDomainDns } from '../../lib/dns-verify';
import { hashPassword } from '../../lib/auth-utils';

// Workspace middleware - checks if user is an organization owner/admin
const workspaceMiddleware = privateProcedure.use(async ({ ctx, next }) => {
  const { sessionUser, db } = ctx;

  // Check if user owns any organizations
  const org = await db
    .select()
    .from(organization)
    .where(and(eq(organization.ownerUserId, sessionUser.id), eq(organization.isActive, true)))
    .limit(1);

  if (!org.length) {
    // Check if user is an organization user (employee)
    const orgUser = await db
      .select()
      .from(organizationUser)
      .where(
        and(eq(organizationUser.userId, sessionUser.id), eq(organizationUser.status, 'active'))
      )
      .limit(1);

    if (!orgUser.length) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Workspace access required',
      });
    }

    // Get organization for the user
    const userOrg = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgUser[0].organizationId))
      .limit(1);

    if (!userOrg.length || !userOrg[0].isActive) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Organization is not active',
      });
    }

    return next({
      ctx: {
        ...ctx,
        organization: userOrg[0],
        organizationUser: orgUser[0],
        isOwner: false,
      },
    });
  }

  return next({
    ctx: {
      ...ctx,
      organization: org[0],
      organizationUser: null,
      isOwner: true,
    },
  });
});

// Helper to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const workspaceRouter = router({
  // ======================= Dashboard =======================

  getDashboardStats: workspaceMiddleware.query(async ({ ctx }) => {
    const { db, organization: org, isOwner } = ctx;

    // Get counts in parallel
    const [userCount, domainCount, activeDomains, _pendingUsers] = await Promise.all([
      db
        .select({ count: count() })
        .from(organizationUser)
        .where(eq(organizationUser.organizationId, org.id)),
      db
        .select({ count: count() })
        .from(organizationDomain)
        .where(eq(organizationDomain.organizationId, org.id)),
      db
        .select({ count: count() })
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.organizationId, org.id),
            eq(organizationDomain.status, 'active')
          )
        ),
      db
        .select({ count: count() })
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.organizationId, org.id),
            eq(organizationUser.status, 'pending')
          )
        ),
    ]);

    const totalStorage = Number(org.totalStorageBytes) || 0;
    const usedStorage = Number(org.usedStorageBytes) || 0;
    const storagePercentage = totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.id,
        status: org.isActive ? 'active' : 'suspended',
        allocatedStorageBytes: totalStorage,
        usedStorageBytes: usedStorage,
      },
      isOwner,
      userCount: userCount[0]?.count ?? 0,
      domainCount: domainCount[0]?.count ?? 0,
      activeDomains: activeDomains[0]?.count ?? 0,
      pendingInvoices: 0, // TODO: implement pending invoices count
      archivalEnabled: false, // TODO: check if any domain has archival enabled
      storage: {
        allocated: totalStorage,
        used: usedStorage,
        percentage: Math.round(storagePercentage * 100) / 100,
        allocatedFormatted: formatBytes(totalStorage),
        usedFormatted: formatBytes(usedStorage),
      },
    };
  }),

  getOrganization: workspaceMiddleware.query(async ({ ctx }) => {
    const { organization: org, isOwner } = ctx;

    return {
      organization: org,
      isOwner,
    };
  }),

  updateOrganization: workspaceMiddleware
    .input(
      z.object({
        name: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        gstNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can update organization details',
        });
      }

      await db
        .update(organization)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(organization.id, org.id));

      return { success: true };
    }),

  // ======================= Domains =======================

  getDomains: workspaceMiddleware.query(async ({ ctx }) => {
    const { db, organization: org } = ctx;

    const domains = await db
      .select()
      .from(organizationDomain)
      .where(eq(organizationDomain.organizationId, org.id))
      .orderBy(desc(organizationDomain.isPrimary), asc(organizationDomain.createdAt));

    // Map backend status to frontend verification status
    const mapStatus = (status: string | null): string => {
      if (status === 'active') return 'verified';
      if (status === 'pending') return 'pending';
      if (status === 'failed') return 'failed';
      return 'pending';
    };

    return {
      domains: domains.map((d) => ({
        id: d.id,
        domainName: d.domainName,
        verificationStatus: mapStatus(d.status),
        dnsVerified: d.dnsVerified ?? false,
        mxVerified: d.dnsVerified ?? false, // Using dnsVerified as proxy
        spfVerified: d.dnsVerified ?? false,
        dkimVerified: d.dnsVerified ?? false,
        dmarcVerified: d.dnsVerified ?? false,
        isPrimary: d.isPrimary ?? false,
        createdAt: d.createdAt?.toISOString() || new Date().toISOString(),
      })),
    };
  }),

  getDomainById: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Get user count for this domain
      const userCount = await db
        .select({ count: count() })
        .from(organizationUser)
        .where(eq(organizationUser.domainId, input.domainId));

      return {
        domain: domain[0],
        userCount: userCount[0]?.count ?? 0,
      };
    }),

  createDomain: workspaceMiddleware
    .input(
      z.object({
        domainName: z.string().min(1),
        isPrimary: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can add domains',
        });
      }

      // Check if domain already exists
      const existingDomain = await db
        .select()
        .from(organizationDomain)
        .where(eq(organizationDomain.domainName, input.domainName.toLowerCase()))
        .limit(1);

      if (existingDomain.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Domain already registered' });
      }

      const domainId = crypto.randomUUID();

      // Generate DNS records for the domain
      const mxRecord = `mail.nubo.email`;
      const spfRecord = `v=spf1 include:_spf.nubo.email ~all`;
      const dkimSelector = `nubo`;
      const dkimRecord = `nubo._domainkey.${input.domainName}`;
      const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email`;

      await db.insert(organizationDomain).values({
        id: domainId,
        organizationId: org.id,
        domainName: input.domainName.toLowerCase(),
        isPrimary: input.isPrimary ?? false,
        dnsVerified: false,
        mxRecord,
        spfRecord,
        dkimRecord,
        dkimSelector,
        dmarcRecord,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create approval request if organization has a partner
      if (org.partnerId) {
        await db.insert(approvalRequest).values({
          id: crypto.randomUUID(),
          type: 'domain',
          requestorType: 'organization',
          requestorOrganizationId: org.id,
          targetOrganizationId: org.id,
          targetDomainId: domainId,
          requestData: {
            domainName: input.domainName,
            organizationName: org.name,
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return {
        success: true,
        domainId,
        dnsRecords: { mxRecord, spfRecord, dkimSelector, dkimRecord, dmarcRecord },
      };
    }),

  getDomainDnsRecords: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      const d = domain[0];
      return {
        domainName: d.domainName,
        mxRecord: d.mxRecord,
        spfRecord: d.spfRecord,
        dkimSelector: d.dkimSelector,
        dkimRecord: d.dkimRecord,
        dmarcRecord: d.dmarcRecord,
        dnsVerified: d.dnsVerified,
        status: d.status,
      };
    }),

  verifyDomainDns: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can verify DNS',
        });
      }

      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Perform actual DNS verification
      const dnsResult = await verifyDomainDns(domain[0].domainName, {
        expectedMx: 'mail.nubo.email',
        expectedSpfInclude: '_spf.nubo.email',
        dkimSelector: domain[0].dkimSelector || 'dkim',
      });

      // Update domain with verification results
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // If all DNS records are verified, mark domain as active
      if (dnsResult.allVerified) {
        updates.dnsVerified = true;
        updates.dnsVerifiedAt = new Date();
        updates.status = 'active';

        // Create domain in Mailcow if not already exists
        try {
          const domainExists = await mailcowApi.domainExists(domain[0].domainName);
          if (!domainExists) {
            await mailcowApi.createDomain({
              domain: domain[0].domainName,
              description: `Organization: ${org.name}`,
              defquota: 1024, // 1GB default
              maxquota: 10240, // 10GB max
              quota: 10240, // 10GB total
            });

            // Generate DKIM key
            await mailcowApi.generateDkim({
              domain: domain[0].domainName,
              dkim_selector: 'dkim',
            });
          }
        } catch (mailcowError) {
          console.error('Failed to create domain in Mailcow:', mailcowError);
          // Don't fail the verification, just log the error
        }
      } else {
        updates.status = 'dns_pending';
      }

      await db
        .update(organizationDomain)
        .set(updates)
        .where(eq(organizationDomain.id, input.domainId));

      return {
        success: true,
        verified: dnsResult.allVerified,
        results: {
          mx: { verified: dnsResult.mx.verified, records: dnsResult.mx.records },
          spf: { verified: dnsResult.spf.verified, record: dnsResult.spf.record },
          dkim: { verified: dnsResult.dkim.verified, record: dnsResult.dkim.record },
          dmarc: { verified: dnsResult.dmarc.verified, record: dnsResult.dmarc.record },
        },
      };
    }),

  // ======================= Users =======================

  getUsers: workspaceMiddleware
    .input(
      z.object({
        domainId: z.string().optional(),
        status: z.enum(['pending', 'active', 'suspended']).optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(organizationUser.organizationId, org.id)];
      if (input.domainId) {
        conditions.push(eq(organizationUser.domainId, input.domainId));
      }
      if (input.status) {
        conditions.push(eq(organizationUser.status, input.status));
      }
      if (input.search) {
        conditions.push(
          or(
            like(organizationUser.emailAddress, `%${input.search}%`),
            like(organizationUser.displayName, `%${input.search}%`)
          )!
        );
      }

      const whereConditions = and(...conditions);

      const [users, totalCount] = await Promise.all([
        db
          .select()
          .from(organizationUser)
          .where(whereConditions)
          .orderBy(desc(organizationUser.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(organizationUser).where(whereConditions),
      ]);

      // Transform users to match frontend expectations
      const transformedUsers = users.map((u) => ({
        id: u.id,
        emailAddress: u.emailAddress,
        displayName: u.displayName || u.emailAddress.split('@')[0],
        role: 'member', // Default role - organization owners are handled differently
        status: u.status || 'pending',
        storageUsedBytes: Number(u.mailboxUsedBytes || 0) + Number(u.driveUsedBytes || 0),
        hasProSubscription: u.hasProSubscription || false,
        createdAt: u.createdAt?.toISOString() || new Date().toISOString(),
      }));

      return {
        users: transformedUsers,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  getUserById: workspaceMiddleware
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      const user = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!user.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Get domain info
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(eq(organizationDomain.id, user[0].domainId))
        .limit(1);

      return {
        user: user[0],
        domain: domain[0],
      };
    }),

  createUser: workspaceMiddleware
    .input(
      z.object({
        domainId: z.string(),
        emailAddress: z.string().email(),
        displayName: z.string().optional(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        mailboxStorageBytes: z.number().optional(),
        driveStorageBytes: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can create users',
        });
      }

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Check domain is active
      if (domain[0].status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Domain is not active. Please verify DNS first.',
        });
      }

      // Verify email matches domain
      const emailDomain = input.emailAddress.split('@')[1];
      if (emailDomain?.toLowerCase() !== domain[0].domainName.toLowerCase()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Email address must match the domain',
        });
      }

      // Check if email already exists in organizationUser
      const existingOrgUser = await db
        .select()
        .from(organizationUser)
        .where(eq(organizationUser.emailAddress, input.emailAddress.toLowerCase()))
        .limit(1);

      if (existingOrgUser.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email address already exists' });
      }

      // Check if email already exists in main user table
      const existingMainUser = await db
        .select()
        .from(user)
        .where(eq(user.email, input.emailAddress.toLowerCase()))
        .limit(1);

      if (existingMainUser.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email address already registered' });
      }

      // Check storage availability
      const quotaMB = input.mailboxStorageBytes ? Math.floor(input.mailboxStorageBytes / (1024 * 1024)) : 1024;
      const totalUserStorage = (input.mailboxStorageBytes ?? 0) + (input.driveStorageBytes ?? 0);
      const availableStorage = Number(org.totalStorageBytes) - Number(org.usedStorageBytes);
      if (totalUserStorage > availableStorage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Insufficient storage available',
        });
      }

      const orgUserId = crypto.randomUUID();
      const mainUserId = crypto.randomUUID();
      const localPart = input.emailAddress.split('@')[0];
      const emailLower = input.emailAddress.toLowerCase();

      // 1. Create mailbox in Mailcow
      try {
        const mailcowResult = await mailcowApi.createMailbox({
          local_part: localPart,
          domain: domain[0].domainName,
          name: input.displayName || localPart,
          password: input.password,
          quota: quotaMB,
        });

        if (mailcowResult.type === 'error' || mailcowResult.type === 'danger') {
          throw new Error(
            Array.isArray(mailcowResult.msg) ? mailcowResult.msg.join(', ') : mailcowResult.msg || 'Failed to create mailbox'
          );
        }
      } catch (mailcowError) {
        console.error('Failed to create mailbox in Mailcow:', mailcowError);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create mailbox: ${mailcowError instanceof Error ? mailcowError.message : 'Unknown error'}`,
        });
      }

      // 2. Create user in main user table (for login to /mail/inbox)
      const hashedPassword = await hashPassword(input.password);

      await db.insert(user).values({
        id: mainUserId,
        email: emailLower,
        name: input.displayName || localPart,
        emailVerified: true, // Pre-verified since created by org owner
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Create account record for credential login
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId: mainUserId,
        accountId: mainUserId,
        providerId: 'credential',
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 4. Get IMAP/SMTP config
      const mailConfig = mailcowApi.getMailboxConfig(emailLower);

      // 5. Create organization user record
      await db.insert(organizationUser).values({
        id: orgUserId,
        organizationId: org.id,
        domainId: input.domainId,
        userId: mainUserId, // Link to main user table
        emailAddress: emailLower,
        displayName: input.displayName,
        mailboxStorageBytes: input.mailboxStorageBytes ?? 1073741824, // 1GB default
        driveStorageBytes: input.driveStorageBytes ?? 0,
        // IMAP/SMTP credentials
        imapHost: mailConfig.imap.host,
        imapPort: mailConfig.imap.port,
        imapUsername: emailLower,
        imapPasswordEncrypted: input.password, // TODO: Encrypt this
        smtpHost: mailConfig.smtp.host,
        smtpPort: mailConfig.smtp.port,
        smtpUsername: emailLower,
        smtpPasswordEncrypted: input.password, // TODO: Encrypt this
        status: 'active', // Active immediately since mailbox is created
        provisionedBy: ctx.sessionUser.id,
        provisionedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update organization's used storage
      if (totalUserStorage > 0) {
        await db
          .update(organization)
          .set({
            usedStorageBytes: Number(org.usedStorageBytes) + totalUserStorage,
            updatedAt: new Date(),
          })
          .where(eq(organization.id, org.id));
      }

      return {
        success: true,
        userId: orgUserId,
        mainUserId,
        emailAddress: emailLower,
        imapConfig: {
          host: mailConfig.imap.host,
          port: mailConfig.imap.port,
          security: mailConfig.imap.security,
          username: emailLower,
        },
        smtpConfig: {
          host: mailConfig.smtp.host,
          port: mailConfig.smtp.port,
          security: mailConfig.smtp.security,
          username: emailLower,
        },
      };
    }),

  updateUser: workspaceMiddleware
    .input(
      z.object({
        userId: z.string(),
        displayName: z.string().optional(),
        mailboxStorageBytes: z.number().optional(),
        driveStorageBytes: z.number().optional(),
        status: z.enum(['active', 'suspended']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can update users',
        });
      }

      // Verify user belongs to organization
      const user = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!user.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const { userId, ...updates } = input;

      // Handle storage reallocation
      if (updates.mailboxStorageBytes !== undefined || updates.driveStorageBytes !== undefined) {
        const currentTotal =
          Number(user[0].mailboxStorageBytes) + Number(user[0].driveStorageBytes);
        const newMailbox = updates.mailboxStorageBytes ?? Number(user[0].mailboxStorageBytes);
        const newDrive = updates.driveStorageBytes ?? Number(user[0].driveStorageBytes);
        const newTotal = newMailbox + newDrive;
        const difference = newTotal - currentTotal;

        if (difference > 0) {
          // Adding more storage - check availability
          const availableStorage = Number(org.totalStorageBytes) - Number(org.usedStorageBytes);
          if (difference > availableStorage) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Insufficient storage available',
            });
          }
        }

        // Update organization's used storage
        await db
          .update(organization)
          .set({
            usedStorageBytes: Number(org.usedStorageBytes) + difference,
            updatedAt: new Date(),
          })
          .where(eq(organization.id, org.id));
      }

      await db
        .update(organizationUser)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizationUser.id, userId));

      return { success: true };
    }),

  // ======================= Archival =======================

  getArchivalConfig: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      const archival = await db
        .select()
        .from(emailArchival)
        .where(eq(emailArchival.domainId, input.domainId))
        .limit(1);

      return {
        domain: domain[0],
        archival: archival[0] ?? null,
        isEnabled: domain[0].archivalEnabled,
      };
    }),

  requestArchival: workspaceMiddleware
    .input(
      z.object({
        domainId: z.string(),
        storageBytes: z.number().min(1),
        retentionDays: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can request archival',
        });
      }

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Check if archival already exists
      const existingArchival = await db
        .select()
        .from(emailArchival)
        .where(eq(emailArchival.domainId, input.domainId))
        .limit(1);

      if (existingArchival.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Archival already configured for this domain',
        });
      }

      // Create approval request
      await db.insert(approvalRequest).values({
        id: crypto.randomUUID(),
        type: 'archival',
        requestorType: 'organization',
        requestorOrganizationId: org.id,
        targetOrganizationId: org.id,
        targetDomainId: input.domainId,
        requestData: {
          domainName: domain[0].domainName,
          storageBytes: input.storageBytes,
          retentionDays: input.retentionDays ?? 2555,
          organizationName: org.name,
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true };
    }),

  // ======================= Invoices =======================

  getInvoices: workspaceMiddleware
    .input(
      z.object({
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can view invoices',
        });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(invoice.organizationId, org.id)];
      if (input.status) {
        conditions.push(eq(invoice.status, input.status));
      }

      const whereConditions = and(...conditions);

      const [invoices, totalCount] = await Promise.all([
        db
          .select()
          .from(invoice)
          .where(whereConditions)
          .orderBy(desc(invoice.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(invoice).where(whereConditions),
      ]);

      return {
        invoices,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  getInvoiceById: workspaceMiddleware
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can view invoices',
        });
      }

      const invoiceData = await db
        .select()
        .from(invoice)
        .where(and(eq(invoice.id, input.invoiceId), eq(invoice.organizationId, org.id)))
        .limit(1);

      if (!invoiceData.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Get line items
      const lineItems = await db
        .select()
        .from(invoiceLineItem)
        .where(eq(invoiceLineItem.invoiceId, input.invoiceId));

      return {
        invoice: invoiceData[0],
        lineItems,
      };
    }),

  // ======================= Pricing =======================

  getPricing: workspaceMiddleware.query(async ({ ctx }) => {
    const { db, organization: org } = ctx;

    // Check if organization has partner pricing
    // Organization gets retail pricing, partner discount is for partner only

    const categories = await db
      .select()
      .from(planCategory)
      .where(eq(planCategory.isActive, true))
      .orderBy(asc(planCategory.sortOrder));

    const variants = await db
      .select()
      .from(planVariant)
      .where(eq(planVariant.isActive, true))
      .orderBy(asc(planVariant.sortOrder));

    const pricingByCategory = categories.map((category) => ({
      ...category,
      variants: variants.filter((v) => v.categoryId === category.id),
    }));

    return {
      isRetail: org.isRetail,
      hasPartner: !!org.partnerId,
      categories: pricingByCategory,
    };
  }),

  // ======================= Pro Subscriptions =======================

  getUserProStatus: workspaceMiddleware
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      const user = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!user.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      return {
        hasProSubscription: user[0].hasProSubscription,
        subscriptionType: user[0].proSubscriptionType,
        expiresAt: user[0].proSubscriptionExpiresAt,
      };
    }),

  assignProSubscription: workspaceMiddleware
    .input(
      z.object({
        userId: z.string(),
        subscriptionType: z.enum(['monthly', 'yearly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can assign Pro subscriptions',
        });
      }

      // Verify user belongs to organization
      const user = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!user.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Calculate expiration date
      const now = new Date();
      const expiresAt = new Date(now);
      if (input.subscriptionType === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      await db
        .update(organizationUser)
        .set({
          hasProSubscription: true,
          proSubscriptionType: input.subscriptionType,
          proSubscriptionExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(organizationUser.id, input.userId));

      return { success: true, expiresAt };
    }),

  removeProSubscription: workspaceMiddleware
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can remove Pro subscriptions',
        });
      }

      // Verify user belongs to organization
      const orgUser = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!orgUser.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      await db
        .update(organizationUser)
        .set({
          hasProSubscription: false,
          proSubscriptionType: null,
          proSubscriptionExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationUser.id, input.userId));

      return { success: true };
    }),

  // ======================= Delete Operations =======================

  deleteUser: workspaceMiddleware
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can delete users',
        });
      }

      // Get user details
      const orgUser = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!orgUser.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const userRecord = orgUser[0];

      // Create approval request for admin to delete mailbox manually
      await db.insert(approvalRequest).values({
        id: crypto.randomUUID(),
        type: 'user_deletion',
        requestorType: 'organization',
        requestorOrganizationId: org.id,
        targetOrganizationId: org.id,
        targetUserId: input.userId,
        requestData: {
          emailAddress: userRecord.emailAddress,
          displayName: userRecord.displayName,
          organizationName: org.name,
          action: 'delete_mailbox',
          mailboxStorageBytes: userRecord.mailboxStorageBytes,
          driveStorageBytes: userRecord.driveStorageBytes,
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mark user as pending deletion
      await db
        .update(organizationUser)
        .set({
          status: 'pending_deletion',
          updatedAt: new Date(),
        })
        .where(eq(organizationUser.id, input.userId));

      return { success: true, message: 'Delete request sent to admin for approval' };
    }),

  deleteDomain: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can delete domains',
        });
      }

      // Get domain details
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Check if domain has active users
      const domainUsers = await db
        .select({ count: count() })
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.domainId, input.domainId),
            eq(organizationUser.status, 'active')
          )
        );

      if ((domainUsers[0]?.count ?? 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete domain with active users. Please delete all users first.',
        });
      }

      // Create approval request for admin to delete domain manually
      await db.insert(approvalRequest).values({
        id: crypto.randomUUID(),
        type: 'domain_deletion',
        requestorType: 'organization',
        requestorOrganizationId: org.id,
        targetOrganizationId: org.id,
        targetDomainId: input.domainId,
        requestData: {
          domainName: domain[0].domainName,
          organizationName: org.name,
          action: 'delete_domain',
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mark domain as pending deletion
      await db
        .update(organizationDomain)
        .set({
          status: 'pending_deletion',
          updatedAt: new Date(),
        })
        .where(eq(organizationDomain.id, input.domainId));

      return { success: true, message: 'Delete request sent to admin for approval' };
    }),

  // ======================= Alias Management =======================

  getAliases: workspaceMiddleware
    .input(z.object({ domainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, organization: org } = ctx;

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Get aliases from Mailcow
      try {
        const aliases = await mailcowApi.getAliasesByDomain(domain[0].domainName);
        return {
          aliases: aliases.map(a => ({
            id: a.id,
            address: a.address,
            goto: a.goto,
            active: a.active === 1,
            created: a.created,
            modified: a.modified,
          })),
        };
      } catch (error) {
        console.error('Failed to get aliases from Mailcow:', error);
        return { aliases: [] };
      }
    }),

  createAlias: workspaceMiddleware
    .input(
      z.object({
        domainId: z.string(),
        aliasAddress: z.string().email('Invalid alias address'),
        gotoAddress: z.string().email('Invalid destination address'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can create aliases',
        });
      }

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Verify alias address matches domain
      const aliasDomain = input.aliasAddress.split('@')[1];
      if (aliasDomain?.toLowerCase() !== domain[0].domainName.toLowerCase()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Alias address must match the domain',
        });
      }

      // Create alias in Mailcow
      try {
        const result = await mailcowApi.createAlias({
          address: input.aliasAddress,
          goto: input.gotoAddress,
        });

        if (result.type === 'error' || result.type === 'danger') {
          throw new Error(
            Array.isArray(result.msg) ? result.msg.join(', ') : result.msg || 'Failed to create alias'
          );
        }

        return { success: true };
      } catch (error) {
        console.error('Failed to create alias in Mailcow:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create alias: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  deleteAlias: workspaceMiddleware
    .input(
      z.object({
        domainId: z.string(),
        aliasId: z.number(),
        aliasAddress: z.string().email(),
        gotoAddress: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can delete aliases',
        });
      }

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, org.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Create approval request for admin to delete alias manually
      await db.insert(approvalRequest).values({
        id: crypto.randomUUID(),
        type: 'alias_deletion',
        requestorType: 'organization',
        requestorOrganizationId: org.id,
        targetOrganizationId: org.id,
        targetDomainId: input.domainId,
        requestData: {
          aliasId: input.aliasId,
          aliasAddress: input.aliasAddress,
          gotoAddress: input.gotoAddress,
          domainName: domain[0].domainName,
          organizationName: org.name,
          action: 'delete_alias',
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, message: 'Delete request sent to admin for approval' };
    }),

  // ======================= Password Management =======================

  resetUserPassword: workspaceMiddleware
    .input(
      z.object({
        userId: z.string(),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can reset passwords',
        });
      }

      // Get user details
      const orgUser = await db
        .select()
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organizationUser.organizationId, org.id)
          )
        )
        .limit(1);

      if (!orgUser.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const userRecord = orgUser[0];

      // 1. Update password in Mailcow
      try {
        await mailcowApi.updateMailboxPassword(userRecord.emailAddress, input.newPassword);
      } catch (mailcowError) {
        console.error('Failed to update password in Mailcow:', mailcowError);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update mailbox password',
        });
      }

      // 2. Update password in main user table if linked
      if (userRecord.userId) {
        const hashedPassword = await hashPassword(input.newPassword);
        await db
          .update(account)
          .set({
            password: hashedPassword,
            updatedAt: new Date(),
          })
          .where(and(eq(account.userId, userRecord.userId), eq(account.providerId, 'credential')));
      }

      // 3. Update stored credentials (TODO: encrypt these)
      await db
        .update(organizationUser)
        .set({
          imapPasswordEncrypted: input.newPassword,
          smtpPasswordEncrypted: input.newPassword,
          updatedAt: new Date(),
        })
        .where(eq(organizationUser.id, input.userId));

      return { success: true };
    }),
});
