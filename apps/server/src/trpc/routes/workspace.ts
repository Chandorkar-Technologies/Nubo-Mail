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
} from '../../db/schema';

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
    const [userCount, domainCount, activeDomains, pendingUsers] = await Promise.all([
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
      organizationName: org.name,
      isOwner,
      userCount: userCount[0]?.count ?? 0,
      domainCount: domainCount[0]?.count ?? 0,
      activeDomains: activeDomains[0]?.count ?? 0,
      pendingUsers: pendingUsers[0]?.count ?? 0,
      storage: {
        total: totalStorage,
        used: usedStorage,
        percentage: Math.round(storagePercentage * 100) / 100,
        totalFormatted: formatBytes(totalStorage),
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

    return db
      .select()
      .from(organizationDomain)
      .where(eq(organizationDomain.organizationId, org.id))
      .orderBy(desc(organizationDomain.isPrimary), asc(organizationDomain.createdAt));
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

      // TODO: Implement actual DNS verification using DNS lookup
      // For now, just mark as verified for testing purposes
      // In production, you'd check MX, SPF, DKIM, DMARC records

      await db
        .update(organizationDomain)
        .set({
          dnsVerified: true,
          dnsVerifiedAt: new Date(),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(organizationDomain.id, input.domainId));

      return { success: true, verified: true };
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

      return {
        users,
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

      // Check if email already exists
      const existingUser = await db
        .select()
        .from(organizationUser)
        .where(eq(organizationUser.emailAddress, input.emailAddress.toLowerCase()))
        .limit(1);

      if (existingUser.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email address already exists' });
      }

      // Check storage availability
      const totalUserStorage = (input.mailboxStorageBytes ?? 0) + (input.driveStorageBytes ?? 0);
      const availableStorage = Number(org.totalStorageBytes) - Number(org.usedStorageBytes);
      if (totalUserStorage > availableStorage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Insufficient storage available',
        });
      }

      const userId = crypto.randomUUID();
      const username = input.emailAddress.split('@')[0];
      const nuboUsername = `${username}@nubo.email`;

      await db.insert(organizationUser).values({
        id: userId,
        organizationId: org.id,
        domainId: input.domainId,
        emailAddress: input.emailAddress.toLowerCase(),
        nuboUsername,
        displayName: input.displayName,
        mailboxStorageBytes: input.mailboxStorageBytes ?? 0,
        driveStorageBytes: input.driveStorageBytes ?? 0,
        status: 'pending',
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

      // Create approval request if organization has a partner
      if (org.partnerId) {
        await db.insert(approvalRequest).values({
          id: crypto.randomUUID(),
          type: 'user',
          requestorType: 'organization',
          requestorOrganizationId: org.id,
          targetOrganizationId: org.id,
          targetUserId: userId,
          requestData: {
            emailAddress: input.emailAddress,
            displayName: input.displayName,
            organizationName: org.name,
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return { success: true, userId, nuboUsername };
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
});
