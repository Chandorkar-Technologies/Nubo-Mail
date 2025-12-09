/**
 * Admin Router
 * Handles all admin dashboard operations including:
 * - Partner management (approve/reject applications, manage tiers)
 * - Organization management
 * - User provisioning approvals
 * - Pricing management
 * - Invoice management
 * - Storage allocation
 */

import { privateProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq, and, desc, asc, count, sql, like } from 'drizzle-orm';
import {
  adminUser,
  adminRole,
  partner,
  partnershipApplication,
  partnerTier,
  partnerQuarterlySales,
  organization,
  organizationDomain,
  organizationUser,
  planCategory,
  planVariant,
  invoice,
  invoiceLineItem,
  paymentTransaction,
  approvalRequest,
} from '../../db/schema';

// Admin middleware - checks if user is an admin
const adminMiddleware = privateProcedure.use(async ({ ctx, next }) => {
  const { sessionUser, db } = ctx;

  // Check if user is an admin
  const admin = await db
    .select()
    .from(adminUser)
    .where(and(eq(adminUser.userId, sessionUser.id), eq(adminUser.isActive, true)))
    .limit(1);

  if (!admin.length) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  // Get admin role and permissions
  let permissions: string[] = [];
  if (admin[0].isSuperAdmin) {
    permissions = ['*'];
  } else if (admin[0].roleId) {
    const role = await db
      .select()
      .from(adminRole)
      .where(eq(adminRole.id, admin[0].roleId))
      .limit(1);

    if (role.length) {
      permissions = role[0].permissions as string[];
    }
  }

  return next({
    ctx: {
      ...ctx,
      admin: admin[0],
      permissions,
      isSuperAdmin: admin[0].isSuperAdmin ?? false,
    },
  });
});

// Helper to check permissions
const checkPermission = (permissions: string[], required: string): boolean => {
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
};

export const adminRouter = router({
  // ======================= Dashboard Stats =======================

  getDashboardStats: adminMiddleware.query(async ({ ctx }) => {
    const { db } = ctx;

    // Get counts in parallel
    const [
      partnerCount,
      pendingApplications,
      activeOrganizations,
      pendingApprovals,
      totalRevenue,
    ] = await Promise.all([
      db.select({ count: count() }).from(partner).where(eq(partner.isActive, true)),
      db.select({ count: count() }).from(partnershipApplication).where(eq(partnershipApplication.status, 'pending')),
      db.select({ count: count() }).from(organization).where(eq(organization.isActive, true)),
      db.select({ count: count() }).from(approvalRequest).where(eq(approvalRequest.status, 'pending')),
      db.select({ total: sql<string>`COALESCE(SUM(${invoice.totalAmount}), 0)` }).from(invoice).where(eq(invoice.status, 'paid')),
    ]);

    return {
      totalPartners: partnerCount[0]?.count ?? 0,
      pendingApplications: pendingApplications[0]?.count ?? 0,
      activeOrganizations: activeOrganizations[0]?.count ?? 0,
      pendingApprovals: pendingApprovals[0]?.count ?? 0,
      totalRevenue: totalRevenue[0]?.total ?? '0',
    };
  }),

  // ======================= Partner Tiers =======================

  getPartnerTiers: adminMiddleware.query(async ({ ctx }) => {
    const { db, permissions } = ctx;

    if (!checkPermission(permissions, 'pricing:read')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
    }

    return db.select().from(partnerTier).orderBy(asc(partnerTier.sortOrder));
  }),

  updatePartnerTier: adminMiddleware
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().optional(),
        discountPercentage: z.string().optional(),
        minQuarterlySales: z.string().optional(),
        maxQuarterlySales: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'pricing:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const { id, ...updates } = input;

      await db
        .update(partnerTier)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(partnerTier.id, id));

      return { success: true };
    }),

  // ======================= Partnership Applications =======================

  getPartnershipApplications: adminMiddleware
    .input(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const offset = (input.page - 1) * input.limit;

      const whereConditions = input.status
        ? eq(partnershipApplication.status, input.status)
        : undefined;

      const [applications, totalCount] = await Promise.all([
        db
          .select()
          .from(partnershipApplication)
          .where(whereConditions)
          .orderBy(desc(partnershipApplication.createdAt))
          .limit(input.limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(partnershipApplication)
          .where(whereConditions),
      ]);

      return {
        applications,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  approvePartnershipApplication: adminMiddleware
    .input(
      z.object({
        applicationId: z.string(),
        tierId: z.string().optional(),
        allocatedStorageBytes: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions, sessionUser } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      // Get the application
      const application = await db
        .select()
        .from(partnershipApplication)
        .where(eq(partnershipApplication.id, input.applicationId))
        .limit(1);

      if (!application.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });
      }

      if (application[0].status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Application already processed' });
      }

      // Get entry tier if no tier specified
      let tierId = input.tierId;
      if (!tierId) {
        const entryTier = await db
          .select()
          .from(partnerTier)
          .where(eq(partnerTier.name, 'entry'))
          .limit(1);
        tierId = entryTier[0]?.id;
      }

      // Get tier details
      const tier = tierId
        ? await db.select().from(partnerTier).where(eq(partnerTier.id, tierId)).limit(1)
        : null;

      // Create partner
      const partnerId = crypto.randomUUID();
      await db.insert(partner).values({
        id: partnerId,
        userId: application[0].userId!,
        applicationId: application[0].id,
        companyName: application[0].companyName,
        companyWebsite: application[0].companyWebsite,
        companyAddress: application[0].companyAddress,
        companyGst: application[0].companyGst,
        tierId: tierId ?? null,
        tierName: tier?.[0]?.name ?? 'entry',
        discountPercentage: tier?.[0]?.discountPercentage ?? '20.00',
        allocatedStorageBytes: input.allocatedStorageBytes ?? 10 * 1024 * 1024 * 1024, // Default 10GB
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update application status
      await db
        .update(partnershipApplication)
        .set({
          status: 'approved',
          reviewedBy: sessionUser.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(partnershipApplication.id, input.applicationId));

      return { success: true, partnerId };
    }),

  rejectPartnershipApplication: adminMiddleware
    .input(
      z.object({
        applicationId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions, sessionUser } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(partnershipApplication)
        .set({
          status: 'rejected',
          reviewedBy: sessionUser.id,
          reviewedAt: new Date(),
          rejectionReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(partnershipApplication.id, input.applicationId));

      return { success: true };
    }),

  // ======================= Partners =======================

  getPartners: adminMiddleware
    .input(
      z.object({
        search: z.string().optional(),
        tierName: z.string().optional(),
        isActive: z.boolean().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.isActive !== undefined) {
        conditions.push(eq(partner.isActive, input.isActive));
      }
      if (input.tierName) {
        conditions.push(eq(partner.tierName, input.tierName));
      }
      if (input.search) {
        conditions.push(like(partner.companyName, `%${input.search}%`));
      }

      const whereConditions = conditions.length > 0 ? and(...conditions) : undefined;

      const [partners, totalCount] = await Promise.all([
        db
          .select()
          .from(partner)
          .where(whereConditions)
          .orderBy(desc(partner.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(partner).where(whereConditions),
      ]);

      return {
        partners,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  getPartnerById: adminMiddleware
    .input(z.object({ partnerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const partnerData = await db
        .select()
        .from(partner)
        .where(eq(partner.id, input.partnerId))
        .limit(1);

      if (!partnerData.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Partner not found' });
      }

      // Get organizations
      const organizations = await db
        .select()
        .from(organization)
        .where(eq(organization.partnerId, input.partnerId))
        .orderBy(desc(organization.createdAt));

      // Get quarterly sales
      const quarterlySales = await db
        .select()
        .from(partnerQuarterlySales)
        .where(eq(partnerQuarterlySales.partnerId, input.partnerId))
        .orderBy(desc(partnerQuarterlySales.year), desc(partnerQuarterlySales.quarter))
        .limit(8);

      return {
        partner: partnerData[0],
        organizations,
        organizationCount: organizations.length,
        quarterlySales,
      };
    }),

  suspendPartner: adminMiddleware
    .input(z.object({ partnerId: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(partner)
        .set({
          isActive: false,
          suspendedAt: new Date(),
          suspensionReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(partner.id, input.partnerId));

      return { success: true };
    }),

  activatePartner: adminMiddleware
    .input(z.object({ partnerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(partner)
        .set({
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(partner.id, input.partnerId));

      return { success: true };
    }),

  updatePartnerTierById: adminMiddleware
    .input(z.object({ partnerId: z.string(), tierName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      // Get tier details
      const tier = await db
        .select()
        .from(partnerTier)
        .where(eq(partnerTier.name, input.tierName))
        .limit(1);

      if (!tier.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tier not found' });
      }

      await db
        .update(partner)
        .set({
          tierId: tier[0].id,
          tierName: tier[0].name,
          discountPercentage: tier[0].discountPercentage,
          updatedAt: new Date(),
        })
        .where(eq(partner.id, input.partnerId));

      return { success: true };
    }),

  updatePartnerStorage: adminMiddleware
    .input(z.object({ partnerId: z.string(), storageBytes: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(partner)
        .set({
          allocatedStorageBytes: input.storageBytes,
          updatedAt: new Date(),
        })
        .where(eq(partner.id, input.partnerId));

      return { success: true };
    }),

  updatePartner: adminMiddleware
    .input(
      z.object({
        partnerId: z.string(),
        tierId: z.string().optional(),
        discountPercentage: z.string().optional(),
        allocatedStorageBytes: z.number().optional(),
        isActive: z.boolean().optional(),
        suspensionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'partners:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const { partnerId, ...updates } = input;

      // If tier is being updated, also update tierName
      if (updates.tierId) {
        const tier = await db
          .select()
          .from(partnerTier)
          .where(eq(partnerTier.id, updates.tierId))
          .limit(1);

        if (tier.length) {
          (updates as any).tierName = tier[0].name;
        }
      }

      // If suspending, set suspended time
      if (updates.isActive === false) {
        (updates as any).suspendedAt = new Date();
      } else if (updates.isActive === true) {
        (updates as any).suspendedAt = null;
        (updates as any).suspensionReason = null;
      }

      await db
        .update(partner)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(partner.id, partnerId));

      return { success: true };
    }),

  // ======================= Organizations =======================

  getOrganizations: adminMiddleware
    .input(
      z.object({
        partnerId: z.string().optional(),
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        isRetail: z.boolean().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.partnerId) {
        conditions.push(eq(organization.partnerId, input.partnerId));
      }
      if (input.isActive !== undefined) {
        conditions.push(eq(organization.isActive, input.isActive));
      }
      if (input.isRetail !== undefined) {
        conditions.push(eq(organization.isRetail, input.isRetail));
      }
      if (input.search) {
        conditions.push(like(organization.name, `%${input.search}%`));
      }

      const whereConditions = conditions.length > 0 ? and(...conditions) : undefined;

      const [organizations, totalCount] = await Promise.all([
        db
          .select()
          .from(organization)
          .where(whereConditions)
          .orderBy(desc(organization.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(organization).where(whereConditions),
      ]);

      return {
        organizations,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  getOrganizationById: adminMiddleware
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const org = await db
        .select()
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);

      if (!org.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      // Get domains
      const domains = await db
        .select()
        .from(organizationDomain)
        .where(eq(organizationDomain.organizationId, input.organizationId));

      // Get user count
      const userCount = await db
        .select({ count: count() })
        .from(organizationUser)
        .where(eq(organizationUser.organizationId, input.organizationId));

      return {
        organization: org[0],
        domains,
        userCount: userCount[0]?.count ?? 0,
      };
    }),

  updateOrganizationStorage: adminMiddleware
    .input(z.object({ organizationId: z.string(), storageBytes: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(organization)
        .set({
          totalStorageBytes: input.storageBytes,
          updatedAt: new Date(),
        })
        .where(eq(organization.id, input.organizationId));

      return { success: true };
    }),

  assignOrganizationToPartner: adminMiddleware
    .input(z.object({
      organizationId: z.string(),
      partnerId: z.string().nullable()
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      // Verify partner exists if partnerId is provided
      if (input.partnerId) {
        const partnerExists = await db
          .select({ id: partner.id })
          .from(partner)
          .where(eq(partner.id, input.partnerId))
          .limit(1);

        if (!partnerExists.length) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Partner not found' });
        }
      }

      await db
        .update(organization)
        .set({
          partnerId: input.partnerId,
          isRetail: input.partnerId === null, // Mark as retail if no partner
          updatedAt: new Date(),
        })
        .where(eq(organization.id, input.organizationId));

      return { success: true };
    }),

  suspendOrganization: adminMiddleware
    .input(z.object({ organizationId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(organization)
        .set({
          isActive: false,
          suspendedAt: new Date(),
          suspensionReason: input.reason || null,
          updatedAt: new Date(),
        })
        .where(eq(organization.id, input.organizationId));

      return { success: true };
    }),

  activateOrganization: adminMiddleware
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'organizations:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      await db
        .update(organization)
        .set({
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(organization.id, input.organizationId));

      return { success: true };
    }),

  // ======================= Approval Requests =======================

  getApprovalRequests: adminMiddleware
    .input(
      z.object({
        type: z.enum(['domain', 'user', 'storage', 'archival', 'organization']).optional(),
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'approvals:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.type) {
        conditions.push(eq(approvalRequest.type, input.type));
      }
      if (input.status) {
        conditions.push(eq(approvalRequest.status, input.status));
      }

      const whereConditions = conditions.length > 0 ? and(...conditions) : undefined;

      const [requests, totalCount] = await Promise.all([
        db
          .select()
          .from(approvalRequest)
          .where(whereConditions)
          .orderBy(desc(approvalRequest.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(approvalRequest).where(whereConditions),
      ]);

      return {
        requests,
        total: totalCount[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / input.limit),
      };
    }),

  processApprovalRequest: adminMiddleware
    .input(
      z.object({
        requestId: z.string(),
        action: z.enum(['approve', 'reject']),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions, sessionUser } = ctx;

      if (!checkPermission(permissions, 'approvals:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const request = await db
        .select()
        .from(approvalRequest)
        .where(eq(approvalRequest.id, input.requestId))
        .limit(1);

      if (!request.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
      }

      if (request[0].status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
      }

      // Process based on request type
      if (input.action === 'approve') {
        // Handle different approval types
        switch (request[0].type) {
          case 'domain':
            if (request[0].targetDomainId) {
              await db
                .update(organizationDomain)
                .set({
                  status: 'dns_pending',
                  approvedBy: sessionUser.id,
                  approvedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(organizationDomain.id, request[0].targetDomainId));
            }
            break;

          case 'user':
            if (request[0].targetUserId) {
              await db
                .update(organizationUser)
                .set({
                  status: 'active',
                  provisionedBy: sessionUser.id,
                  provisionedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(organizationUser.id, request[0].targetUserId));
            }
            break;

          // Add more cases as needed
        }
      }

      // Update request status
      await db
        .update(approvalRequest)
        .set({
          status: input.action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: sessionUser.id,
          reviewedAt: new Date(),
          rejectionReason: input.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(approvalRequest.id, input.requestId));

      return { success: true };
    }),

  // ======================= Pricing Management =======================

  getPlanCategories: adminMiddleware.query(async ({ ctx }) => {
    const { db, permissions } = ctx;

    if (!checkPermission(permissions, 'pricing:read')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
    }

    return db.select().from(planCategory).orderBy(asc(planCategory.sortOrder));
  }),

  getPlanVariants: adminMiddleware
    .input(z.object({ categoryId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'pricing:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const conditions = input.categoryId
        ? eq(planVariant.categoryId, input.categoryId)
        : undefined;

      return db
        .select()
        .from(planVariant)
        .where(conditions)
        .orderBy(asc(planVariant.sortOrder));
    }),

  createPlanVariant: adminMiddleware
    .input(
      z.object({
        categoryId: z.string(),
        name: z.string(),
        displayName: z.string(),
        storageGb: z.number(),
        retailPriceMonthly: z.string(),
        retailPriceYearly: z.string(),
        partnerPriceMonthly: z.string(),
        partnerPriceYearly: z.string(),
        currency: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'pricing:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      // Verify category exists
      const category = await db
        .select()
        .from(planCategory)
        .where(eq(planCategory.id, input.categoryId))
        .limit(1);

      if (!category.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan category not found' });
      }

      // Convert GB to bytes
      const storageBytes = input.storageGb * 1024 * 1024 * 1024;

      const id = crypto.randomUUID();
      await db.insert(planVariant).values({
        id,
        categoryId: input.categoryId,
        name: input.name,
        displayName: input.displayName,
        storageBytes,
        retailPriceMonthly: input.retailPriceMonthly,
        retailPriceYearly: input.retailPriceYearly,
        partnerPriceMonthly: input.partnerPriceMonthly,
        partnerPriceYearly: input.partnerPriceYearly,
        currency: input.currency ?? 'INR',
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, id };
    }),

  updatePlanVariant: adminMiddleware
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().optional(),
        retailPriceMonthly: z.string().optional(),
        retailPriceYearly: z.string().optional(),
        partnerPriceMonthly: z.string().optional(),
        partnerPriceYearly: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'pricing:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const { id, ...updates } = input;

      await db
        .update(planVariant)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(planVariant.id, id));

      return { success: true };
    }),

  // ======================= Invoices =======================

  getInvoices: adminMiddleware
    .input(
      z.object({
        partnerId: z.string().optional(),
        organizationId: z.string().optional(),
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'invoices:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.partnerId) {
        conditions.push(eq(invoice.partnerId, input.partnerId));
      }
      if (input.organizationId) {
        conditions.push(eq(invoice.organizationId, input.organizationId));
      }
      if (input.status) {
        conditions.push(eq(invoice.status, input.status));
      }

      const whereConditions = conditions.length > 0 ? and(...conditions) : undefined;

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

  getInvoiceById: adminMiddleware
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'invoices:read')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const invoiceData = await db
        .select()
        .from(invoice)
        .where(eq(invoice.id, input.invoiceId))
        .limit(1);

      if (!invoiceData.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Get line items
      const lineItems = await db
        .select()
        .from(invoiceLineItem)
        .where(eq(invoiceLineItem.invoiceId, input.invoiceId));

      // Get payment transactions
      const transactions = await db
        .select()
        .from(paymentTransaction)
        .where(eq(paymentTransaction.invoiceId, input.invoiceId))
        .orderBy(desc(paymentTransaction.createdAt));

      return {
        invoice: invoiceData[0],
        lineItems,
        transactions,
      };
    }),

  updateInvoiceStatus: adminMiddleware
    .input(
      z.object({
        invoiceId: z.string(),
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, permissions } = ctx;

      if (!checkPermission(permissions, 'invoices:write')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' });
      }

      const updates: any = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === 'sent') {
        updates.sentAt = new Date();
      } else if (input.status === 'paid') {
        updates.paidAt = new Date();
      }

      await db.update(invoice).set(updates).where(eq(invoice.id, input.invoiceId));

      return { success: true };
    }),

  // ======================= Admin Users =======================

  getAdminUsers: adminMiddleware.query(async ({ ctx }) => {
    const { db, isSuperAdmin } = ctx;

    if (!isSuperAdmin) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' });
    }

    return db.select().from(adminUser).orderBy(desc(adminUser.createdAt));
  }),

  addAdminUser: adminMiddleware
    .input(
      z.object({
        userId: z.string(),
        roleId: z.string().optional(),
        isSuperAdmin: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, isSuperAdmin } = ctx;

      if (!isSuperAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' });
      }

      const id = crypto.randomUUID();
      await db.insert(adminUser).values({
        id,
        userId: input.userId,
        roleId: input.roleId ?? null,
        isSuperAdmin: input.isSuperAdmin ?? false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true, id };
    }),

  removeAdminUser: adminMiddleware
    .input(z.object({ adminUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, isSuperAdmin, admin } = ctx;

      if (!isSuperAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' });
      }

      // Can't remove yourself
      if (admin.id === input.adminUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself' });
      }

      await db.delete(adminUser).where(eq(adminUser.id, input.adminUserId));

      return { success: true };
    }),

  getAdminRoles: adminMiddleware.query(async ({ ctx }) => {
    const { db, isSuperAdmin } = ctx;

    if (!isSuperAdmin) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' });
    }

    return db.select().from(adminRole);
  }),
});
