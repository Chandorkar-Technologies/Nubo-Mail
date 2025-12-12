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
import { eq, and, desc, asc, count, or, like, sql } from 'drizzle-orm';
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
  connection,
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
        // Mailcow settings
        domainQuotaGB: z.number().min(1).default(10), // Domain quota in GB
        maxQuotaPerMailboxMB: z.number().min(100).default(10240), // Max quota per mailbox in MB
        defaultQuotaPerMailboxMB: z.number().min(100).default(1024), // Default quota per mailbox in MB
        maxMailboxes: z.number().min(0).default(0), // 0 = unlimited
        rateLimitPerHour: z.number().min(0).default(500), // Emails per hour
        relayDomain: z.boolean().default(false),
        relayAllRecipients: z.boolean().default(false),
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

      // Check storage availability
      const domainQuotaBytes = input.domainQuotaGB * 1024 * 1024 * 1024;
      const availableStorage = Number(org.totalStorageBytes) - Number(org.usedStorageBytes);
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
          const mailcowResult = await mailcowApi.createDomain({
            domain: input.domainName.toLowerCase(),
            description: `Organization: ${org.name}`,
            aliases: 400,
            mailboxes: input.maxMailboxes || 10000, // 0 = unlimited in our system, but Mailcow needs a number
            defquota: input.defaultQuotaPerMailboxMB,
            maxquota: input.maxQuotaPerMailboxMB,
            quota: input.domainQuotaGB * 1024, // Convert GB to MB for Mailcow
            active: 1,
            relay_all_recipients: 0,
            relay_unknown_only: 0,
          });

          if (mailcowResult.type === 'success') {
            mailcowCreated = true;
            // Generate DKIM key
            await mailcowApi.generateDkim({
              domain: input.domainName.toLowerCase(),
              dkim_selector: 'dkim',
            });
          }
        } else {
          mailcowCreated = true; // Already exists
        }
      } catch (mailcowError) {
        console.error('Failed to create domain in Mailcow:', mailcowError);
        // Continue anyway - can be created later when DNS is verified
      }

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
          usedStorageBytes: Number(org.usedStorageBytes) + domainQuotaBytes,
          updatedAt: new Date(),
        })
        .where(eq(organization.id, org.id));

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
            domainQuotaGB: input.domainQuotaGB,
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return {
        success: true,
        domainId,
        mailcowCreated,
        dnsRecords: { mxRecord, spfRecord, dkimSelector, dkimRecord, dmarcRecord },
      };
    }),

  updateDomain: workspaceMiddleware
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
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can update domains',
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

      const currentDomain = domain[0];
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
            mailcowUpdates.quota = domainQuotaGB * 1024; // GB to MB
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

      const currentDomain = domain[0];

      // Delete from Mailcow if created there
      if (currentDomain.mailcowDomainCreated) {
        try {
          await mailcowApi.deleteDomain(currentDomain.domainName);
        } catch (mailcowError) {
          console.error('Failed to delete domain from Mailcow:', mailcowError);
          // Continue with deletion from our system
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

  // Get actual DNS records with DKIM fetched from Mailcow
  getActualDnsRecords: workspaceMiddleware
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
      console.log('[Workspace] Created connection for user:', emailLower, 'connectionId:', connectionId);

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

  updateUser: workspaceMiddleware
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
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can update users',
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

      const currentUser = orgUser[0];
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

        // Update mailbox quota in Mailcow
        if (updates.mailboxStorageBytes !== undefined) {
          try {
            await mailcowApi.updateMailbox(currentUser.emailAddress, {
              quota: Math.floor(updates.mailboxStorageBytes / (1024 * 1024)), // Convert to MB
            });
          } catch (mailcowError) {
            console.error('Failed to update mailbox quota in Mailcow:', mailcowError);
          }
        }
      }

      // Update password if provided
      if (password) {
        // Update in Mailcow
        try {
          await mailcowApi.updateMailboxPassword(currentUser.emailAddress, password);
        } catch (mailcowError) {
          console.error('Failed to update password in Mailcow:', mailcowError);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update password in mail server',
          });
        }

        // Update in our account table
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

          // Update IMAP/SMTP password in organizationUser
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

      // Update status in Mailcow if changed
      if (updates.status !== undefined) {
        try {
          await mailcowApi.updateMailbox(currentUser.emailAddress, {
            active: updates.status === 'active' ? 1 : 0,
          });
        } catch (mailcowError) {
          console.error('Failed to update mailbox status in Mailcow:', mailcowError);
        }
      }

      // Update display name in Mailcow if changed
      if (updates.displayName !== undefined) {
        try {
          await mailcowApi.updateMailbox(currentUser.emailAddress, {
            name: updates.displayName,
          });
        } catch (mailcowError) {
          console.error('Failed to update mailbox name in Mailcow:', mailcowError);
        }

        // Also update in main user table
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

      const currentUser = orgUser[0];

      // Delete mailbox from Mailcow
      try {
        await mailcowApi.deleteMailbox(currentUser.emailAddress);
      } catch (mailcowError) {
        console.error('Failed to delete mailbox from Mailcow:', mailcowError);
        // Continue with deletion from our system
      }

      // Return storage to organization
      const storageToReturn =
        Number(currentUser.mailboxStorageBytes) + Number(currentUser.driveStorageBytes);
      if (storageToReturn > 0) {
        await db
          .update(organization)
          .set({
            usedStorageBytes: Math.max(0, Number(org.usedStorageBytes) - storageToReturn),
            updatedAt: new Date(),
          })
          .where(eq(organization.id, org.id));
      }

      // Delete from main user table if linked
      if (currentUser.userId) {
        // Delete account records first
        await db.delete(account).where(eq(account.userId, currentUser.userId));
        // Delete user
        await db.delete(user).where(eq(user.id, currentUser.userId));
      }

      // Delete organization user record
      await db.delete(organizationUser).where(eq(organizationUser.id, input.userId));

      return { success: true };
    }),

  // Bulk pro subscription for all users in organization
  bulkProSubscription: workspaceMiddleware
    .input(
      z.object({
        subscriptionType: z.enum(['monthly', 'yearly']),
        userIds: z.array(z.string()).optional(), // If not provided, apply to all users
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, organization: org, isOwner } = ctx;

      if (!isOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization owner can manage subscriptions',
        });
      }

      // Get users to update
      let usersToUpdate;
      if (input.userIds && input.userIds.length > 0) {
        usersToUpdate = await db
          .select()
          .from(organizationUser)
          .where(
            and(
              eq(organizationUser.organizationId, org.id),
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
          .where(eq(organizationUser.organizationId, org.id));
      }

      if (usersToUpdate.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No users found' });
      }

      // Calculate expiry date
      const expiresAt = new Date();
      if (input.subscriptionType === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // Update all users
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
