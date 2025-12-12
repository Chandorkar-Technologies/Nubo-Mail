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
import { eq, and, desc, asc, count, or, like, sql } from 'drizzle-orm';
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
  user,
  account,
  connection,
} from '../../db/schema';
import { mailcowApi } from '../../lib/mailcow';
import { verifyDomainDns } from '../../lib/dns-verify';
import { hashPassword } from '../../lib/auth-utils';

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
        // Mailcow settings
        domainQuotaGB: z.number().min(1).default(10), // Domain quota in GB
        maxQuotaPerMailboxMB: z.number().min(100).default(10240), // Max quota per mailbox in MB
        defaultQuotaPerMailboxMB: z.number().min(100).default(1024), // Default quota per mailbox in MB
        maxMailboxes: z.number().min(0).default(0), // 0 = unlimited
        rateLimitPerHour: z.number().min(0).default(500), // Emails per hour
        relayDomain: z.boolean().default(true),
        relayAllRecipients: z.boolean().default(true),
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

      // Check storage availability
      const domainQuotaBytes = input.domainQuotaGB * 1024 * 1024 * 1024;
      const availableStorage = Number(org[0].totalStorageBytes) - Number(org[0].usedStorageBytes);
      if (domainQuotaBytes > availableStorage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Insufficient storage. Available: ${Math.floor(availableStorage / (1024 * 1024 * 1024))}GB, Requested: ${input.domainQuotaGB}GB`,
        });
      }

      const domainId = crypto.randomUUID();

      // Generate DNS records for the domain
      const mxRecord = `mx1.nubo.email`;
      const spfRecord = `v=spf1 a mx ip4:46.224.135.53 ip6:2a01:4f8:c013:fd93::1 include:mailchannels.net -all`;
      const dkimSelector = `dkim`;
      const dkimRecord = `dkim._domainkey.${input.domainName}`;
      const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email; ruf=mailto:dmarc@nubo.email; fo=1; pct=100`;

      // Create domain in Mailcow immediately
      let mailcowCreated = false;
      try {
        const domainExists = await mailcowApi.domainExists(input.domainName.toLowerCase());
        if (!domainExists) {
          console.log('[Mailcow] Creating domain:', input.domainName.toLowerCase());
          const mailcowResult = await mailcowApi.createDomain({
            domain: input.domainName.toLowerCase(),
            description: `Organization: ${org[0].name}`,
            aliases: 400,
            mailboxes: input.maxMailboxes || 10000,
            defquota: input.defaultQuotaPerMailboxMB,
            maxquota: input.maxQuotaPerMailboxMB,
            quota: input.domainQuotaGB * 1024,
            active: 1,
            relay_all_recipients: input.relayAllRecipients ? 1 : 0,
          });
          console.log('[Mailcow] Domain creation result:', JSON.stringify(mailcowResult));

          // Check for success - Mailcow returns array of results
          const results = Array.isArray(mailcowResult) ? mailcowResult : [mailcowResult];
          const hasSuccess = results.some((r: { type?: string }) => r.type === 'success');
          const hasError = results.some((r: { type?: string }) => r.type === 'danger' || r.type === 'error');

          if (hasSuccess && !hasError) {
            mailcowCreated = true;
            // Generate DKIM key
            console.log('[Mailcow] Generating DKIM for domain:', input.domainName.toLowerCase());
            await mailcowApi.generateDkim({
              domain: input.domainName.toLowerCase(),
              dkim_selector: 'dkim',
            });
          } else if (hasError) {
            const errorMsg = results.find((r: { type?: string }) => r.type === 'danger' || r.type === 'error');
            console.error('[Mailcow] Domain creation failed:', errorMsg);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to create domain in mail server: ${JSON.stringify(errorMsg?.msg || 'Unknown error')}`,
            });
          }
        } else {
          console.log('[Mailcow] Domain already exists:', input.domainName.toLowerCase());
          mailcowCreated = true;
        }
      } catch (mailcowError) {
        console.error('[Mailcow] Failed to create domain:', mailcowError);
        if (mailcowError instanceof TRPCError) throw mailcowError;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to connect to mail server: ${mailcowError instanceof Error ? mailcowError.message : 'Unknown error'}`,
        });
      }

      await db.insert(organizationDomain).values({
        id: domainId,
        organizationId: input.organizationId,
        domainName: input.domainName.toLowerCase(),
        isPrimary: input.isPrimary ?? false,
        dnsVerified: false,
        mxRecord,
        spfRecord,
        dkimRecord,
        dkimSelector,
        dmarcRecord,
        // Mailcow settings
        domainQuotaBytes,
        maxQuotaPerMailboxMB: input.maxQuotaPerMailboxMB,
        defaultQuotaPerMailboxMB: input.defaultQuotaPerMailboxMB,
        maxMailboxes: input.maxMailboxes,
        rateLimitPerHour: input.rateLimitPerHour,
        relayDomain: input.relayDomain,
        relayAllRecipients: input.relayAllRecipients,
        mailcowActive: true,
        mailcowDomainCreated: mailcowCreated,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update organization's used storage
      await db
        .update(organization)
        .set({
          usedStorageBytes: Number(org[0].usedStorageBytes) + domainQuotaBytes,
          updatedAt: new Date(),
        })
        .where(eq(organization.id, input.organizationId));

      return {
        success: true,
        domainId,
        mailcowCreated,
        dnsRecords: { mxRecord, spfRecord, dkimSelector, dkimRecord, dmarcRecord },
      };
    }),

  updateDomain: partnerMiddleware
    .input(
      z.object({
        domainId: z.string(),
        isPrimary: z.boolean().optional(),
        domainQuotaGB: z.number().min(1).optional(),
        maxQuotaPerMailboxMB: z.number().min(100).optional(),
        defaultQuotaPerMailboxMB: z.number().min(100).optional(),
        maxMailboxes: z.number().min(0).optional(),
        rateLimitPerHour: z.number().min(0).optional(),
        relayDomain: z.boolean().optional(),
        relayAllRecipients: z.boolean().optional(),
        mailcowActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const currentDomain = domain[0].organization_domain;
      const org = domain[0].organization;
      const { domainId, domainQuotaGB, ...otherUpdates } = input;

      // Handle quota change
      let newQuotaBytes = currentDomain.domainQuotaBytes;
      if (domainQuotaGB !== undefined) {
        newQuotaBytes = domainQuotaGB * 1024 * 1024 * 1024;
        const difference = newQuotaBytes - Number(currentDomain.domainQuotaBytes);

        if (difference > 0) {
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

      // Update Mailcow if domain is created there
      if (currentDomain.mailcowDomainCreated) {
        try {
          const mailcowUpdates: Record<string, unknown> = {};
          if (domainQuotaGB !== undefined) {
            mailcowUpdates.quota = domainQuotaGB * 1024;
          }
          if (input.maxQuotaPerMailboxMB !== undefined) {
            mailcowUpdates.maxquota = input.maxQuotaPerMailboxMB;
          }
          if (input.defaultQuotaPerMailboxMB !== undefined) {
            mailcowUpdates.defquota = input.defaultQuotaPerMailboxMB;
          }
          if (input.maxMailboxes !== undefined) {
            mailcowUpdates.mailboxes = input.maxMailboxes || 10000;
          }
          if (input.relayAllRecipients !== undefined) {
            mailcowUpdates.relay_all_recipients = input.relayAllRecipients ? 1 : 0;
          }
          if (input.mailcowActive !== undefined) {
            mailcowUpdates.active = input.mailcowActive ? 1 : 0;
          }

          if (Object.keys(mailcowUpdates).length > 0) {
            await mailcowApi.updateDomain(currentDomain.domainName, mailcowUpdates);
          }
        } catch (mailcowError) {
          console.error('Failed to update domain in Mailcow:', mailcowError);
        }
      }

      await db
        .update(organizationDomain)
        .set({
          ...otherUpdates,
          domainQuotaBytes: newQuotaBytes,
          updatedAt: new Date(),
        })
        .where(eq(organizationDomain.id, domainId));

      return { success: true };
    }),

  deleteDomain: partnerMiddleware
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      // Check if domain has users
      const userCount = await db
        .select({ count: count() })
        .from(organizationUser)
        .where(eq(organizationUser.domainId, input.domainId));

      if ((userCount[0]?.count ?? 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete domain with users. Delete all users first.',
        });
      }

      const currentDomain = domain[0].organization_domain;
      const org = domain[0].organization;

      // Delete from Mailcow if created there
      if (currentDomain.mailcowDomainCreated) {
        try {
          await mailcowApi.deleteDomain(currentDomain.domainName);
        } catch (mailcowError) {
          console.error('Failed to delete domain from Mailcow:', mailcowError);
        }
      }

      // Return storage to organization
      const storageToReturn = Number(currentDomain.domainQuotaBytes) || 0;
      if (storageToReturn > 0) {
        await db
          .update(organization)
          .set({
            usedStorageBytes: Math.max(0, Number(org.usedStorageBytes) - storageToReturn),
            updatedAt: new Date(),
          })
          .where(eq(organization.id, org.id));
      }

      // Delete domain
      await db.delete(organizationDomain).where(eq(organizationDomain.id, input.domainId));

      return { success: true };
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

  // Get actual DNS records with DKIM fetched from Mailcow
  getActualDnsRecords: partnerMiddleware
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
      const domainName = d.domainName;

      // Try to fetch DKIM from Mailcow
      let dkimRecord = null;
      let dkimSelector = 'dkim';
      try {
        const dkim = await mailcowApi.getDkim(domainName);
        if (dkim) {
          dkimRecord = dkim.dkim_txt;
          dkimSelector = dkim.dkim_selector || 'dkim';
        }
      } catch (error) {
        console.error('Failed to fetch DKIM from Mailcow:', error);
      }

      // Return comprehensive DNS records
      return {
        domainName,
        dnsVerified: d.dnsVerified,
        status: d.status,
        records: {
          // MX Records (Primary and Secondary)
          mx: [
            {
              type: 'MX',
              host: '@',
              value: 'mx1.nubo.email',
              priority: 10,
              description: 'Primary mail server',
            },
            {
              type: 'MX',
              host: '@',
              value: 'mx2.nubo.email',
              priority: 20,
              description: 'Secondary mail server',
            },
          ],
          // SPF Record
          spf: {
            type: 'TXT',
            host: '@',
            value: 'v=spf1 a mx ip4:46.224.135.53 ip6:2a01:4f8:c013:fd93::1 include:mailchannels.net -all',
            description: 'SPF record to authorize mail servers',
          },
          // DKIM Record (fetched from Mailcow if available)
          dkim: dkimRecord
            ? {
                type: 'TXT',
                host: `${dkimSelector}._domainkey`,
                value: dkimRecord,
                selector: dkimSelector,
                description: 'DKIM record for email authentication',
              }
            : {
                type: 'TXT',
                host: 'dkim._domainkey',
                value: 'Pending - Domain needs to be verified first',
                selector: 'dkim',
                description: 'DKIM record will be generated after domain verification',
              },
          // DMARC Record
          dmarc: {
            type: 'TXT',
            host: '_dmarc',
            value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email; ruf=mailto:dmarc@nubo.email; fo=1; pct=100',
            description: 'DMARC policy for email authentication',
          },
          // Autodiscover for Outlook/Exchange
          autodiscover: {
            type: 'CNAME',
            host: 'autodiscover',
            value: 'autodiscover.nubo.email',
            description: 'Autodiscover for Outlook/Exchange clients',
          },
          // Autoconfig for Thunderbird
          autoconfig: {
            type: 'CNAME',
            host: 'autoconfig',
            value: 'autoconfig.nubo.email',
            description: 'Autoconfig for Thunderbird and other clients',
          },
          // SRV Records for auto-configuration
          srv: [
            {
              type: 'SRV',
              host: '_autodiscover._tcp',
              value: '0 0 443 autodiscover.nubo.email',
              priority: 0,
              weight: 0,
              port: 443,
              target: 'autodiscover.nubo.email',
              description: 'SRV record for Autodiscover',
            },
            {
              type: 'SRV',
              host: '_imaps._tcp',
              value: '0 1 993 mail.nubo.email',
              priority: 0,
              weight: 1,
              port: 993,
              target: 'mail.nubo.email',
              description: 'SRV record for IMAP over SSL',
            },
            {
              type: 'SRV',
              host: '_submission._tcp',
              value: '0 1 587 mail.nubo.email',
              priority: 0,
              weight: 1,
              port: 587,
              target: 'mail.nubo.email',
              description: 'SRV record for SMTP submission',
            },
          ],
        },
        // Custom mail server configuration option
        customMailServer: {
          description: 'Alternative: Use your own mail server',
          example: {
            mx: {
              type: 'MX',
              host: '@',
              value: 'mail.yourdomain.com',
              priority: 10,
            },
            a: {
              type: 'A',
              host: 'mail',
              value: 'YOUR_SERVER_IP',
            },
          },
        },
      };
    }),

  // Verify domain DNS records
  verifyDomainDns: partnerMiddleware
    .input(z.object({ domainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
      const org = domain[0].organization;

      // Perform actual DNS verification
      const dnsResult = await verifyDomainDns(d.domainName, {
        expectedMx: 'mx1.nubo.email',
        expectedSpfInclude: 'mailchannels.net',
        dkimSelector: d.dkimSelector || 'dkim',
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
          const domainExists = await mailcowApi.domainExists(d.domainName);
          if (!domainExists) {
            await mailcowApi.createDomain({
              domain: d.domainName,
              description: `Organization: ${org.name}`,
              defquota: 1024, // 1GB default
              maxquota: 10240, // 10GB max
              quota: 10240, // 10GB total
            });

            // Generate DKIM key
            await mailcowApi.generateDkim({
              domain: d.domainName,
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
        password: z.string().min(8, 'Password must be at least 8 characters'),
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
      const totalUserStorage = (input.mailboxStorageBytes ?? 1073741824) + (input.driveStorageBytes ?? 0);
      const availableOrgStorage =
        Number(org[0].totalStorageBytes) - Number(org[0].usedStorageBytes);
      if (totalUserStorage > availableOrgStorage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Insufficient storage in organization pool',
        });
      }

      const orgUserId = crypto.randomUUID();
      const mainUserId = crypto.randomUUID();
      const localPart = input.emailAddress.split('@')[0];
      const emailLower = input.emailAddress.toLowerCase();

      // 1. Create mailbox in Mailcow
      try {
        console.log('[Mailcow] Creating mailbox:', emailLower);
        const mailcowResult = await mailcowApi.createMailbox({
          local_part: localPart,
          domain: domain[0].domainName,
          name: input.displayName || localPart,
          password: input.password,
          quota: quotaMB,
        });
        console.log('[Mailcow] Mailbox creation result:', JSON.stringify(mailcowResult));

        // Check for errors - Mailcow can return array or single result
        const results = Array.isArray(mailcowResult) ? mailcowResult : [mailcowResult];
        const hasError = results.some((r: { type?: string }) => r.type === 'danger' || r.type === 'error');

        if (hasError) {
          const errorMsg = results.find((r: { type?: string }) => r.type === 'danger' || r.type === 'error');
          throw new Error(
            Array.isArray(errorMsg?.msg) ? errorMsg.msg.join(', ') : errorMsg?.msg || 'Failed to create mailbox'
          );
        }
        console.log('[Mailcow] Mailbox created successfully:', emailLower);
      } catch (mailcowError) {
        console.error('[Mailcow] Failed to create mailbox:', mailcowError);
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
        emailVerified: true,
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
        organizationId: input.organizationId,
        domainId: input.domainId,
        userId: mainUserId,
        emailAddress: emailLower,
        displayName: input.displayName,
        mailboxStorageBytes: input.mailboxStorageBytes ?? 1073741824,
        driveStorageBytes: input.driveStorageBytes ?? 0,
        imapHost: mailConfig.imap.host,
        imapPort: mailConfig.imap.port,
        imapUsername: emailLower,
        imapPasswordEncrypted: input.password,
        smtpHost: mailConfig.smtp.host,
        smtpPort: mailConfig.smtp.port,
        smtpUsername: emailLower,
        smtpPasswordEncrypted: input.password,
        status: 'active',
        provisionedBy: ctx.sessionUser.id,
        provisionedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 6. Create connection record for email access
      const connectionId = crypto.randomUUID();
      await db.insert(connection).values({
        id: connectionId,
        userId: mainUserId,
        email: emailLower,
        name: input.displayName || localPart,
        providerId: 'imap',
        scope: 'mail',
        config: {
          imap: {
            host: mailConfig.imap.host,
            port: mailConfig.imap.port,
            secure: true,
          },
          smtp: {
            host: mailConfig.smtp.host,
            port: mailConfig.smtp.port,
            secure: true,
          },
          auth: {
            user: emailLower,
            pass: input.password,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      });
      console.log('[Partner] Created connection for user:', emailLower, 'connectionId:', connectionId);

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

      return {
        success: true,
        userId: orgUserId,
        mainUserId,
        connectionId,
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

  updateUser: partnerMiddleware
    .input(
      z.object({
        userId: z.string(),
        displayName: z.string().optional(),
        mailboxStorageBytes: z.number().optional(),
        driveStorageBytes: z.number().optional(),
        status: z.enum(['active', 'suspended']).optional(),
        password: z.string().min(8).optional(),
      })
    )
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

      const currentUser = userRecord[0].organization_user;
      const org = userRecord[0].organization;
      const { userId, password, ...updates } = input;

      // Handle storage reallocation
      if (updates.mailboxStorageBytes !== undefined || updates.driveStorageBytes !== undefined) {
        const currentTotal =
          Number(currentUser.mailboxStorageBytes) + Number(currentUser.driveStorageBytes);
        const newMailbox = updates.mailboxStorageBytes ?? Number(currentUser.mailboxStorageBytes);
        const newDrive = updates.driveStorageBytes ?? Number(currentUser.driveStorageBytes);
        const newTotal = newMailbox + newDrive;
        const difference = newTotal - currentTotal;

        if (difference > 0) {
          const availableStorage = Number(org.totalStorageBytes) - Number(org.usedStorageBytes);
          if (difference > availableStorage) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Insufficient storage available',
            });
          }
        }

        await db
          .update(organization)
          .set({
            usedStorageBytes: Number(org.usedStorageBytes) + difference,
            updatedAt: new Date(),
          })
          .where(eq(organization.id, org.id));

        if (updates.mailboxStorageBytes !== undefined) {
          try {
            await mailcowApi.updateMailbox(currentUser.emailAddress, {
              quota: Math.floor(updates.mailboxStorageBytes / (1024 * 1024)),
            });
          } catch (mailcowError) {
            console.error('Failed to update mailbox quota in Mailcow:', mailcowError);
          }
        }
      }

      // Update password if provided
      if (password) {
        try {
          await mailcowApi.updateMailboxPassword(currentUser.emailAddress, password);
        } catch (mailcowError) {
          console.error('Failed to update password in Mailcow:', mailcowError);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update password in mail server',
          });
        }

        if (currentUser.userId) {
          const hashedPassword = await hashPassword(password);
          await db
            .update(account)
            .set({
              password: hashedPassword,
              updatedAt: new Date(),
            })
            .where(
              and(eq(account.userId, currentUser.userId), eq(account.providerId, 'credential'))
            );

          await db
            .update(organizationUser)
            .set({
              imapPasswordEncrypted: password,
              smtpPasswordEncrypted: password,
              updatedAt: new Date(),
            })
            .where(eq(organizationUser.id, userId));
        }
      }

      if (updates.status !== undefined) {
        try {
          await mailcowApi.updateMailbox(currentUser.emailAddress, {
            active: updates.status === 'active' ? 1 : 0,
          });
        } catch (mailcowError) {
          console.error('Failed to update mailbox status in Mailcow:', mailcowError);
        }
      }

      if (updates.displayName !== undefined) {
        try {
          await mailcowApi.updateMailbox(currentUser.emailAddress, {
            name: updates.displayName,
          });
        } catch (mailcowError) {
          console.error('Failed to update mailbox name in Mailcow:', mailcowError);
        }

        if (currentUser.userId) {
          await db
            .update(user)
            .set({
              name: updates.displayName,
              updatedAt: new Date(),
            })
            .where(eq(user.id, currentUser.userId));
        }
      }

      await db
        .update(organizationUser)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizationUser.id, userId));

      return { success: true };
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

      // Delete mailbox from Mailcow
      try {
        await mailcowApi.deleteMailbox(userData.emailAddress);
      } catch (mailcowError) {
        console.error('Failed to delete mailbox from Mailcow:', mailcowError);
      }

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

      // Delete from main user table if linked
      if (userData.userId) {
        await db.delete(account).where(eq(account.userId, userData.userId));
        await db.delete(user).where(eq(user.id, userData.userId));
      }

      // Delete user
      await db.delete(organizationUser).where(eq(organizationUser.id, input.userId));

      return { success: true };
    }),

  // Bulk pro subscription for all users in organization
  bulkProSubscription: partnerMiddleware
    .input(
      z.object({
        organizationId: z.string(),
        subscriptionType: z.enum(['monthly', 'yearly']),
        userIds: z.array(z.string()).optional(),
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

      // Get users to update
      let usersToUpdate;
      if (input.userIds && input.userIds.length > 0) {
        usersToUpdate = await db
          .select()
          .from(organizationUser)
          .where(
            and(
              eq(organizationUser.organizationId, input.organizationId),
              sql`${organizationUser.id} IN (${sql.join(
                input.userIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
          );
      } else {
        usersToUpdate = await db
          .select()
          .from(organizationUser)
          .where(eq(organizationUser.organizationId, input.organizationId));
      }

      if (usersToUpdate.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No users found' });
      }

      const expiresAt = new Date();
      if (input.subscriptionType === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      const userIds = usersToUpdate.map((u) => u.id);
      await db
        .update(organizationUser)
        .set({
          hasProSubscription: true,
          proSubscriptionType: input.subscriptionType,
          proSubscriptionExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(
          sql`${organizationUser.id} IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      return {
        success: true,
        updatedCount: userIds.length,
        expiresAt: expiresAt.toISOString(),
      };
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
