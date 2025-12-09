/**
 * Partner Router
 * Handles all partner dashboard operations including:
 * - Dashboard stats & storage progress
 * - Organization CRUD
 * - Domain management
 * - User management requests
 * - Storage allocation to organizations
 * - Invoice viewing
 * - Storage purchase requests
 */

import { privateProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq, and, desc, asc, count, or, like } from 'drizzle-orm';
import {
  partner,
  partnershipApplication,
  partnerTier,
  partnerQuarterlySales,
  partnerStoragePurchase,
  organization,
  organizationDomain,
  organizationUser,
  planCategory,
  planVariant,
  invoice,
  invoiceLineItem,
} from '../../db/schema';

// Partner middleware - checks if user is a partner
const partnerMiddleware = privateProcedure.use(async ({ ctx, next }) => {
  const { sessionUser, db } = ctx;

  // Check if user is a partner
  const partnerData = await db
    .select()
    .from(partner)
    .where(and(eq(partner.userId, sessionUser.id), eq(partner.isActive, true)))
    .limit(1);

  if (!partnerData.length) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Partner access required',
    });
  }

  // Get tier info
  let tierInfo = null;
  if (partnerData[0].tierId) {
    const tier = await db
      .select()
      .from(partnerTier)
      .where(eq(partnerTier.id, partnerData[0].tierId))
      .limit(1);
    tierInfo = tier[0] ?? null;
  }

  return next({
    ctx: {
      ...ctx,
      partner: partnerData[0],
      tier: tierInfo,
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

export const partnerRouter = router({
  // ======================= Partnership Application (Public) =======================

  submitApplication: privateProcedure
    .input(
      z.object({
        companyName: z.string().min(1),
        companyWebsite: z.string().optional(),
        companyAddress: z.string().optional(),
        companyGst: z.string().optional(),
        contactName: z.string().min(1),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
        expectedMonthlySales: z.string().optional(),
        businessDescription: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, sessionUser } = ctx;

      // Check if already a partner
      const existingPartner = await db
        .select()
        .from(partner)
        .where(eq(partner.userId, sessionUser.id))
        .limit(1);

      if (existingPartner.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You are already a partner',
        });
      }

      // Check for pending application
      const pendingApp = await db
        .select()
        .from(partnershipApplication)
        .where(
          and(
            eq(partnershipApplication.userId, sessionUser.id),
            eq(partnershipApplication.status, 'pending')
          )
        )
        .limit(1);

      if (pendingApp.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have a pending application',
        });
      }

      const id = crypto.randomUUID();
      await db.insert(partnershipApplication).values({
        id,
        userId: sessionUser.id,
        ...input,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, applicationId: id };
    }),

  getApplicationStatus: privateProcedure.query(async ({ ctx }) => {
    const { db, sessionUser } = ctx;

    // Check if already a partner
    const existingPartner = await db
      .select()
      .from(partner)
      .where(eq(partner.userId, sessionUser.id))
      .limit(1);

    if (existingPartner.length) {
      return { status: 'approved', isPartner: true };
    }

    // Get latest application
    const application = await db
      .select()
      .from(partnershipApplication)
      .where(eq(partnershipApplication.userId, sessionUser.id))
      .orderBy(desc(partnershipApplication.createdAt))
      .limit(1);

    if (!application.length) {
      return { status: null, isPartner: false };
    }

    return {
      status: application[0].status,
      isPartner: false,
      application: application[0],
    };
  }),

  // ======================= Dashboard =======================

  getDashboardStats: partnerMiddleware.query(async ({ ctx }) => {
    const { db, partner: partnerData, tier } = ctx;

    // Get counts in parallel
    const [orgCount, userCount, domainCount, pendingInvoices] = await Promise.all([
      db
        .select({ count: count() })
        .from(organization)
        .where(and(eq(organization.partnerId, partnerData.id), eq(organization.isActive, true))),
      db
        .select({ count: count() })
        .from(organizationUser)
        .innerJoin(organization, eq(organizationUser.organizationId, organization.id))
        .where(eq(organization.partnerId, partnerData.id)),
      db
        .select({ count: count() })
        .from(organizationDomain)
        .innerJoin(organization, eq(organizationDomain.organizationId, organization.id))
        .where(eq(organization.partnerId, partnerData.id)),
      db
        .select({ count: count() })
        .from(invoice)
        .where(
          and(
            eq(invoice.partnerId, partnerData.id),
            or(eq(invoice.status, 'sent'), eq(invoice.status, 'overdue'))
          )
        ),
    ]);

    const allocatedStorage = Number(partnerData.allocatedStorageBytes) || 0;
    const usedStorage = Number(partnerData.usedStorageBytes) || 0;
    const storagePercentage = allocatedStorage > 0 ? (usedStorage / allocatedStorage) * 100 : 0;

    return {
      tierName: tier?.displayName ?? 'Entry Partner',
      tierDiscount: tier?.discountPercentage ?? '20.00',
      organizationCount: orgCount[0]?.count ?? 0,
      userCount: userCount[0]?.count ?? 0,
      domainCount: domainCount[0]?.count ?? 0,
      pendingInvoices: pendingInvoices[0]?.count ?? 0,
      storage: {
        allocated: allocatedStorage,
        used: usedStorage,
        percentage: Math.round(storagePercentage * 100) / 100,
        allocatedFormatted: formatBytes(allocatedStorage),
        usedFormatted: formatBytes(usedStorage),
      },
    };
  }),

  getPartnerProfile: partnerMiddleware.query(async ({ ctx }) => {
    const { partner: partnerData, tier } = ctx;

    return {
      partner: partnerData,
      tier,
    };
  }),

  updatePartnerProfile: partnerMiddleware
    .input(
      z.object({
        companyName: z.string().min(1).optional(),
        companyWebsite: z.string().optional(),
        companyAddress: z.string().optional(),
        companyGst: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        panNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      await db
        .update(partner)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(partner.id, partnerData.id));

      return { success: true };
    }),

  // ======================= Quarterly Sales =======================

  getQuarterlySales: partnerMiddleware.query(async ({ ctx }) => {
    const { db, partner: partnerData } = ctx;

    return db
      .select()
      .from(partnerQuarterlySales)
      .where(eq(partnerQuarterlySales.partnerId, partnerData.id))
      .orderBy(desc(partnerQuarterlySales.year), desc(partnerQuarterlySales.quarter))
      .limit(8);
  }),

  // ======================= Organizations =======================

  getOrganizations: partnerMiddleware
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      console.log('[Partner getOrganizations] Partner ID:', partnerData.id, 'Company:', partnerData.companyName);

      // First, let's see ALL organizations to debug
      const allOrgs = await db.select({ id: organization.id, name: organization.name, partnerId: organization.partnerId }).from(organization).limit(10);
      console.log('[Partner getOrganizations] All orgs in DB:', JSON.stringify(allOrgs));

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(organization.partnerId, partnerData.id)];
      if (input.isActive !== undefined) {
        conditions.push(eq(organization.isActive, input.isActive));
      }
      if (input.search) {
        conditions.push(like(organization.name, `%${input.search}%`));
      }

      const whereConditions = and(...conditions);

      const [orgs, totalCount] = await Promise.all([
        db
          .select()
          .from(organization)
          .where(whereConditions)
          .orderBy(desc(organization.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(organization).where(whereConditions),
      ]);

      // Fetch user and domain counts for each organization
      const organizationsWithCounts = await Promise.all(
        orgs.map(async (org) => {
          const [userCountResult, domainCountResult] = await Promise.all([
            db
              .select({ count: count() })
              .from(organizationUser)
              .where(eq(organizationUser.organizationId, org.id)),
            db
              .select({ count: count() })
              .from(organizationDomain)
              .where(eq(organizationDomain.organizationId, org.id)),
          ]);

          return {
            id: org.id,
            name: org.name,
            status: org.isActive ? 'active' : org.suspendedAt ? 'suspended' : 'inactive',
            allocatedStorageBytes: Number(org.totalStorageBytes) || 0,
            usedStorageBytes: Number(org.usedStorageBytes) || 0,
            userCount: userCountResult[0]?.count ?? 0,
            domainCount: domainCountResult[0]?.count ?? 0,
            createdAt: org.createdAt?.toISOString() ?? new Date().toISOString(),
          };
        })
      );

      return {
        organizations: organizationsWithCounts,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  getOrganizationById: partnerMiddleware
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      // Get domains
      const domains = await db
        .select()
        .from(organizationDomain)
        .where(eq(organizationDomain.organizationId, input.organizationId));

      // Get users
      const users = await db
        .select()
        .from(organizationUser)
        .where(eq(organizationUser.organizationId, input.organizationId))
        .orderBy(desc(organizationUser.createdAt));

      return {
        organization: org[0],
        domains,
        users,
        userCount: users.length,
      };
    }),

  createOrganization: partnerMiddleware
    .input(
      z.object({
        name: z.string().min(1),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        gstNumber: z.string().optional(),
        totalStorageBytes: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData, sessionUser } = ctx;

      // Check storage availability if allocating storage
      if (input.totalStorageBytes) {
        const availableStorage =
          Number(partnerData.allocatedStorageBytes) - Number(partnerData.usedStorageBytes);
        if (input.totalStorageBytes > availableStorage) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Insufficient storage in your pool',
          });
        }
      }

      const orgId = crypto.randomUUID();
      await db.insert(organization).values({
        id: orgId,
        name: input.name,
        partnerId: partnerData.id,
        ownerUserId: sessionUser.id, // Partner creates org, initially owns it
        billingEmail: input.billingEmail,
        billingAddress: input.billingAddress,
        gstNumber: input.gstNumber,
        isRetail: false,
        totalStorageBytes: input.totalStorageBytes ?? 0,
        usedStorageBytes: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update partner's used storage
      if (input.totalStorageBytes) {
        await db
          .update(partner)
          .set({
            usedStorageBytes: Number(partnerData.usedStorageBytes) + input.totalStorageBytes,
            updatedAt: new Date(),
          })
          .where(eq(partner.id, partnerData.id));
      }

      return { success: true, organizationId: orgId };
    }),

  updateOrganization: partnerMiddleware
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        gstNumber: z.string().optional(),
        totalStorageBytes: z.number().optional(),
        isActive: z.boolean().optional(),
        suspensionReason: z.string().optional(),
        hybridMailEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Verify organization belongs to partner
      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      const { organizationId, ...updates } = input;

      // Handle storage reallocation
      if (updates.totalStorageBytes !== undefined) {
        const currentAllocation = Number(org[0].totalStorageBytes);
        const newAllocation = updates.totalStorageBytes;
        const difference = newAllocation - currentAllocation;

        if (difference > 0) {
          // Adding more storage - check availability
          const availableStorage =
            Number(partnerData.allocatedStorageBytes) - Number(partnerData.usedStorageBytes);
          if (difference > availableStorage) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Insufficient storage in your pool',
            });
          }
        }

        // Update partner's used storage
        await db
          .update(partner)
          .set({
            usedStorageBytes: Number(partnerData.usedStorageBytes) + difference,
            updatedAt: new Date(),
          })
          .where(eq(partner.id, partnerData.id));
      }

      // Handle suspension
      if (updates.isActive === false) {
        (updates as any).suspendedAt = new Date();
      } else if (updates.isActive === true) {
        (updates as any).suspendedAt = null;
        (updates as any).suspensionReason = null;
      }

      await db
        .update(organization)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organization.id, organizationId));

      return { success: true };
    }),

  deleteOrganization: partnerMiddleware
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Verify organization belongs to partner
      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      const orgData = org[0];

      // Return the storage to partner's pool
      const storageToReturn = Number(orgData.totalStorageBytes) || 0;
      if (storageToReturn > 0) {
        await db
          .update(partner)
          .set({
            usedStorageBytes: Math.max(0, Number(partnerData.usedStorageBytes) - storageToReturn),
            updatedAt: new Date(),
          })
          .where(eq(partner.id, partnerData.id));
      }

      // Delete organization (cascade will handle related records)
      await db.delete(organization).where(eq(organization.id, input.organizationId));

      return { success: true };
    }),

  // ======================= Domains =======================

  createDomain: partnerMiddleware
    .input(
      z.object({
        organizationId: z.string(),
        domainName: z.string().min(1),
        isPrimary: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Verify organization belongs to partner
      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
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
        organizationId: input.organizationId,
        domainName: input.domainName.toLowerCase(),
        isPrimary: input.isPrimary ?? false,
        dnsVerified: true, // Auto-verified for now
        mxRecord,
        spfRecord,
        dkimRecord,
        dkimSelector,
        dmarcRecord,
        status: 'active', // Set to active immediately (no approval required)
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        domainId,
        dnsRecords: { mxRecord, spfRecord, dkimSelector, dkimRecord, dmarcRecord },
      };
    }),

  getDomainDnsRecords: partnerMiddleware
    .input(z.object({ domainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      const domain = await db
        .select()
        .from(organizationDomain)
        .innerJoin(organization, eq(organizationDomain.organizationId, organization.id))
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      const d = domain[0].organization_domain;
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

  // ======================= Users =======================

  getOrganizationUsers: partnerMiddleware
    .input(
      z.object({
        organizationId: z.string(),
        status: z.enum(['pending', 'active', 'suspended']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Verify organization belongs to partner
      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(organizationUser.organizationId, input.organizationId)];
      if (input.status) {
        conditions.push(eq(organizationUser.status, input.status));
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

  createUser: partnerMiddleware
    .input(
      z.object({
        organizationId: z.string(),
        domainId: z.string(),
        emailAddress: z.string().email(),
        displayName: z.string().optional(),
        mailboxStorageBytes: z.number().optional(),
        driveStorageBytes: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Verify organization belongs to partner
      const org = await db
        .select()
        .from(organization)
        .where(
          and(
            eq(organization.id, input.organizationId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      // Verify domain belongs to organization
      const domain = await db
        .select()
        .from(organizationDomain)
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organizationDomain.organizationId, input.organizationId)
          )
        )
        .limit(1);

      if (!domain.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
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
      const availableOrgStorage =
        Number(org[0].totalStorageBytes) - Number(org[0].usedStorageBytes);
      if (totalUserStorage > availableOrgStorage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Insufficient storage in organization pool',
        });
      }

      const userId = crypto.randomUUID();
      const username = input.emailAddress.split('@')[0];
      const nuboUsername = `${username}@nubo.email`;

      await db.insert(organizationUser).values({
        id: userId,
        organizationId: input.organizationId,
        domainId: input.domainId,
        emailAddress: input.emailAddress.toLowerCase(),
        nuboUsername,
        displayName: input.displayName,
        mailboxStorageBytes: input.mailboxStorageBytes ?? 0,
        driveStorageBytes: input.driveStorageBytes ?? 0,
        status: 'active', // Set to active immediately (no approval required)
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update organization's used storage
      if (totalUserStorage > 0) {
        await db
          .update(organization)
          .set({
            usedStorageBytes: Number(org[0].usedStorageBytes) + totalUserStorage,
            updatedAt: new Date(),
          })
          .where(eq(organization.id, input.organizationId));
      }

      return { success: true, userId, nuboUsername };
    }),

  deleteUser: partnerMiddleware
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Get user and verify organization belongs to partner
      const userRecord = await db
        .select()
        .from(organizationUser)
        .innerJoin(organization, eq(organizationUser.organizationId, organization.id))
        .where(
          and(
            eq(organizationUser.id, input.userId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!userRecord.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const userData = userRecord[0].organization_user;
      const orgData = userRecord[0].organization;

      // Return storage to organization pool
      const userStorage = Number(userData.mailboxStorageBytes || 0) + Number(userData.driveStorageBytes || 0);
      if (userStorage > 0) {
        await db
          .update(organization)
          .set({
            usedStorageBytes: Math.max(0, Number(orgData.usedStorageBytes) - userStorage),
            updatedAt: new Date(),
          })
          .where(eq(organization.id, orgData.id));
      }

      // Delete user
      await db.delete(organizationUser).where(eq(organizationUser.id, input.userId));

      return { success: true };
    }),

  deleteDomain: partnerMiddleware
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      // Get domain and verify organization belongs to partner
      const domainRecord = await db
        .select()
        .from(organizationDomain)
        .innerJoin(organization, eq(organizationDomain.organizationId, organization.id))
        .where(
          and(
            eq(organizationDomain.id, input.domainId),
            eq(organization.partnerId, partnerData.id)
          )
        )
        .limit(1);

      if (!domainRecord.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Domain not found' });
      }

      // Check if there are users on this domain
      const usersOnDomain = await db
        .select({ count: count() })
        .from(organizationUser)
        .where(eq(organizationUser.domainId, input.domainId));

      if ((usersOnDomain[0]?.count ?? 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete domain with existing users. Delete all users first.',
        });
      }

      // Delete domain
      await db.delete(organizationDomain).where(eq(organizationDomain.id, input.domainId));

      return { success: true };
    }),

  // ======================= Storage Purchases =======================

  requestStoragePurchase: partnerMiddleware
    .input(
      z.object({
        storageBytes: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, partner: partnerData, tier } = ctx;

      // Calculate price based on partner's discount
      const discountPercent = Number(tier?.discountPercentage ?? 20);
      const basePrice = (input.storageBytes / (1024 * 1024 * 1024)) * 10; // 10 INR per GB base price
      const finalPrice = basePrice * (1 - discountPercent / 100);

      const purchaseId = crypto.randomUUID();
      await db.insert(partnerStoragePurchase).values({
        id: purchaseId,
        partnerId: partnerData.id,
        storageBytes: input.storageBytes,
        amount: finalPrice.toFixed(2),
        currency: 'INR',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, purchaseId, amount: finalPrice.toFixed(2) };
    }),

  getStoragePurchases: partnerMiddleware
    .input(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(partnerStoragePurchase.partnerId, partnerData.id)];
      if (input.status) {
        conditions.push(eq(partnerStoragePurchase.status, input.status));
      }

      const whereConditions = and(...conditions);

      const [purchases, totalCount] = await Promise.all([
        db
          .select()
          .from(partnerStoragePurchase)
          .where(whereConditions)
          .orderBy(desc(partnerStoragePurchase.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(partnerStoragePurchase).where(whereConditions),
      ]);

      return {
        purchases,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  // ======================= Invoices =======================

  getInvoices: partnerMiddleware
    .input(
      z.object({
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(invoice.partnerId, partnerData.id)];
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

  getInvoiceById: partnerMiddleware
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, partner: partnerData } = ctx;

      const invoiceData = await db
        .select()
        .from(invoice)
        .where(and(eq(invoice.id, input.invoiceId), eq(invoice.partnerId, partnerData.id)))
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

  getPricing: partnerMiddleware.query(async ({ ctx }) => {
    const { db, tier } = ctx;

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

    // Apply partner discount to prices
    const discountPercent = Number(tier?.discountPercentage ?? 20);

    const pricingByCategory = categories.map((category) => ({
      ...category,
      variants: variants
        .filter((v) => v.categoryId === category.id)
        .map((v) => ({
          ...v,
          partnerPriceMonthly: (
            Number(v.partnerPriceMonthly) *
            (1 - discountPercent / 100)
          ).toFixed(2),
          partnerPriceYearly: (
            Number(v.partnerPriceYearly) *
            (1 - discountPercent / 100)
          ).toFixed(2),
        })),
    }));

    return {
      tierDiscount: discountPercent,
      categories: pricingByCategory,
    };
  }),
});
