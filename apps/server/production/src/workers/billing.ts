/**
 * Billing Worker for B2B Invoice Generation
 *
 * This worker handles:
 * - Monthly invoice generation for organizations
 * - Overdue invoice notifications
 * - Partner quarterly tier evaluation
 * - Storage usage tracking
 */

import {
  organization,
  organizationUser,
  partner,
  partnerQuarterlySales,
  partnerTier,
  invoice,
  invoiceLineItem,
  razorpaySubscription,
} from '../db/schema';
import { eq, and, lte, gte, sql, desc } from 'drizzle-orm';

interface BillingContext {
  db: any; // DrizzleDB instance
}

// Generate unique invoice number with sequential counter
// Format: INV-YYMM-XXX where XXX is sequential within the month
async function generateInvoiceNumber(db: any): Promise<string> {
  const prefix = 'INV';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const yearMonth = `${year}${month}`;

  // Get the count of invoices for this month to generate sequential number
  const pattern = `${prefix}-${yearMonth}-%`;
  const existingInvoices = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoice)
    .where(sql`${invoice.invoiceNumber} LIKE ${pattern}`);

  const count = (existingInvoices[0]?.count ?? 0) + 1;
  const sequence = count.toString().padStart(3, '0');

  return `${prefix}-${yearMonth}-${sequence}`;
}

// Calculate GST (18%)
function calculateGST(subtotal: number): number {
  return subtotal * 0.18;
}

/**
 * Generate monthly invoices for all organizations with active subscriptions
 */
export async function generateMonthlyInvoices(ctx: BillingContext): Promise<{
  generated: number;
  errors: string[];
}> {
  const db = ctx.db;
  const now = new Date();
  const errors: string[] = [];
  let generated = 0;

  console.log('[BILLING] Starting monthly invoice generation...');

  // Get all active subscriptions that need billing
  const activeSubscriptions = await db.query.razorpaySubscription.findMany({
    where: and(
      eq(razorpaySubscription.status, 'active'),
      lte(razorpaySubscription.currentPeriodEnd, now)
    ),
    with: {
      organization: {
        with: {
          partner: { with: { tier: true } },
        },
      },
      planVariant: true,
    },
  });

  console.log(`[BILLING] Found ${activeSubscriptions.length} subscriptions to process`);

  for (const subscription of activeSubscriptions) {
    try {
      const org = subscription.organization;
      if (!org) continue;

      // Get user count for the organization
      const userCount = await db
        .select({ count: sql`count(*)::int` })
        .from(organizationUser)
        .where(
          and(
            eq(organizationUser.organizationId, org.id),
            eq(organizationUser.status, 'active')
          )
        );

      const activeUserCount = userCount[0]?.count || subscription.quantity || 1;

      // Calculate pricing
      const variant = subscription.planVariant;
      if (!variant) continue;

      const pricing = variant.pricing as any;
      const isAnnual =
        subscription.currentPeriodEnd &&
        (new Date(subscription.currentPeriodEnd).getTime() -
          new Date(subscription.currentPeriodStart!).getTime()) >
          60 * 24 * 60 * 60 * 1000;

      const basePrice = isAnnual ? pricing.INR.yearly : pricing.INR.monthly;
      const subtotal = basePrice * activeUserCount;

      // Apply partner discount
      const discountPercentage = org.partner?.tier?.discountPercentage || 0;
      const discountedPrice = subtotal * (1 - discountPercentage / 100);
      const taxAmount = calculateGST(discountedPrice);
      const totalAmount = discountedPrice + taxAmount;

      // Create invoice
      const invoiceNumber = await generateInvoiceNumber(db);
      const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const newInvoice = await db
        .insert(invoice)
        .values({
          id: crypto.randomUUID(),
          invoiceNumber,
          partnerId: org.partnerId,
          organizationId: org.id,
          invoiceType: 'subscription',
          status: 'pending',
          subtotal: discountedPrice.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          currency: 'INR',
          dueDate,
          billingPeriodStart: subscription.currentPeriodStart,
          billingPeriodEnd: subscription.currentPeriodEnd,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Create line item
      await db.insert(invoiceLineItem).values({
        id: crypto.randomUUID(),
        invoiceId: newInvoice[0].id,
        description: `${variant.displayName} - ${activeUserCount} users`,
        quantity: activeUserCount,
        unitPrice: (discountedPrice / activeUserCount).toFixed(2),
        totalPrice: discountedPrice.toFixed(2),
        createdAt: now,
      });

      // If there was a discount, add a discount line item
      if (discountPercentage > 0) {
        const discountAmount = subtotal - discountedPrice;
        await db.insert(invoiceLineItem).values({
          id: crypto.randomUUID(),
          invoiceId: newInvoice[0].id,
          description: `Partner Discount (${discountPercentage}%)`,
          quantity: 1,
          unitPrice: (-discountAmount).toFixed(2),
          totalPrice: (-discountAmount).toFixed(2),
          createdAt: now,
        });
      }

      // Update subscription billing period
      const newPeriodStart = subscription.currentPeriodEnd;
      const newPeriodEnd = isAnnual
        ? new Date(newPeriodStart!.getTime() + 365 * 24 * 60 * 60 * 1000)
        : new Date(newPeriodStart!.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(razorpaySubscription)
        .set({
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          updatedAt: now,
        })
        .where(eq(razorpaySubscription.id, subscription.id));

      generated++;
      console.log(`[BILLING] Generated invoice ${invoiceNumber} for ${org.name}`);
    } catch (error) {
      const errorMsg = `Failed to generate invoice for subscription ${subscription.id}: ${error}`;
      console.error(`[BILLING] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(`[BILLING] Monthly invoice generation complete. Generated: ${generated}, Errors: ${errors.length}`);
  return { generated, errors };
}

/**
 * Mark overdue invoices and send notifications
 */
export async function processOverdueInvoices(ctx: BillingContext): Promise<{
  processed: number;
  suspended: number;
}> {
  const db = ctx.db;
  const now = new Date();
  let processed = 0;
  let suspended = 0;

  console.log('[BILLING] Processing overdue invoices...');

  // Get pending invoices past due date
  const overdueInvoices = await db.query.invoice.findMany({
    where: and(eq(invoice.status, 'pending'), lte(invoice.dueDate, now)),
    with: {
      organization: true,
    },
  });

  console.log(`[BILLING] Found ${overdueInvoices.length} overdue invoices`);

  for (const inv of overdueInvoices) {
    try {
      // Update invoice status to overdue
      await db
        .update(invoice)
        .set({
          status: 'overdue',
          updatedAt: now,
        })
        .where(eq(invoice.id, inv.id));

      processed++;

      // Check if invoice is more than 30 days overdue - suspend organization
      const daysPastDue = Math.floor(
        (now.getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysPastDue > 30 && inv.organization) {
        await db
          .update(organization)
          .set({
            status: 'suspended',
            updatedAt: now,
          })
          .where(eq(organization.id, inv.organization.id));

        suspended++;
        console.log(`[BILLING] Suspended organization ${inv.organization.name} due to overdue payment`);
      }

      // TODO: Send overdue notification email
    } catch (error) {
      console.error(`[BILLING] Error processing overdue invoice ${inv.id}:`, error);
    }
  }

  console.log(`[BILLING] Overdue processing complete. Processed: ${processed}, Suspended: ${suspended}`);
  return { processed, suspended };
}

/**
 * Evaluate partner tiers quarterly based on sales
 */
export async function evaluatePartnerTiers(ctx: BillingContext): Promise<{
  upgraded: number;
  downgraded: number;
  unchanged: number;
}> {
  const db = ctx.db;
  const now = new Date();
  let upgraded = 0;
  let downgraded = 0;
  let unchanged = 0;

  console.log('[BILLING] Evaluating partner tiers...');

  // Get current quarter boundaries
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
  const quarterEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);

  // Only run on the last day of the quarter
  if (now.getDate() !== quarterEnd.getDate() || now.getMonth() !== quarterEnd.getMonth()) {
    console.log('[BILLING] Not the last day of quarter, skipping tier evaluation');
    return { upgraded: 0, downgraded: 0, unchanged: 0 };
  }

  // Get all tiers
  const tiers = await db.query.partnerTier.findMany({
    orderBy: desc(partnerTier.discountPercentage),
  });

  // Get all partners with their quarterly sales
  const partners = await db.query.partner.findMany({
    where: eq(partner.status, 'active'),
    with: {
      tier: true,
    },
  });

  for (const partnerData of partners) {
    try {
      // Calculate total sales for the quarter (from paid invoices)
      const quarterlyInvoices = await db.query.invoice.findMany({
        where: and(
          eq(invoice.partnerId, partnerData.id),
          eq(invoice.status, 'paid'),
          gte(invoice.paidAt, quarterStart),
          lte(invoice.paidAt, quarterEnd)
        ),
      });

      const totalSales = quarterlyInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.totalAmount || '0'),
        0
      );

      // Record quarterly sales
      await db.insert(partnerQuarterlySales).values({
        id: crypto.randomUUID(),
        partnerId: partnerData.id,
        year: now.getFullYear(),
        quarter: currentQuarter + 1,
        totalSalesAmount: totalSales.toFixed(2),
        organizationCount: await db
          .select({ count: sql`count(*)::int` })
          .from(organization)
          .where(eq(organization.partnerId, partnerData.id))
          .then((r) => r[0]?.count || 0),
        userCount: 0, // TODO: Calculate total users across organizations
        tierAtEnd: partnerData.tierId,
        createdAt: now,
      });

      // Determine new tier based on sales thresholds
      // Tier thresholds (quarterly sales in INR):
      // Gold: > 10,00,000
      // Silver: > 5,00,000
      // Bronze: > 1,00,000
      // Entry: < 1,00,000
      let newTierId = partnerData.tierId;
      const goldTier = tiers.find((t) => t.name === 'gold');
      const silverTier = tiers.find((t) => t.name === 'silver');
      const bronzeTier = tiers.find((t) => t.name === 'bronze');
      const entryTier = tiers.find((t) => t.name === 'entry');

      if (totalSales > 1000000 && goldTier) {
        newTierId = goldTier.id;
      } else if (totalSales > 500000 && silverTier) {
        newTierId = silverTier.id;
      } else if (totalSales > 100000 && bronzeTier) {
        newTierId = bronzeTier.id;
      } else if (entryTier) {
        newTierId = entryTier.id;
      }

      // Only allow one tier step down per quarter
      if (newTierId !== partnerData.tierId) {
        const currentTierIndex = tiers.findIndex((t) => t.id === partnerData.tierId);
        const newTierIndex = tiers.findIndex((t) => t.id === newTierId);

        // If downgrading more than one level, limit to one level
        if (newTierIndex > currentTierIndex + 1) {
          newTierId = tiers[currentTierIndex + 1]?.id || partnerData.tierId;
        }

        // Update partner tier
        await db
          .update(partner)
          .set({
            tierId: newTierId,
            tierNameCached: tiers.find((t) => t.id === newTierId)?.displayName || partnerData.tierNameCached,
            updatedAt: now,
          })
          .where(eq(partner.id, partnerData.id));

        if (newTierIndex < currentTierIndex) {
          upgraded++;
          console.log(`[BILLING] Partner ${partnerData.companyName} upgraded to ${tiers.find((t) => t.id === newTierId)?.displayName}`);
        } else {
          downgraded++;
          console.log(`[BILLING] Partner ${partnerData.companyName} downgraded to ${tiers.find((t) => t.id === newTierId)?.displayName}`);
        }
      } else {
        unchanged++;
      }
    } catch (error) {
      console.error(`[BILLING] Error evaluating tier for partner ${partnerData.id}:`, error);
    }
  }

  console.log(`[BILLING] Tier evaluation complete. Upgraded: ${upgraded}, Downgraded: ${downgraded}, Unchanged: ${unchanged}`);
  return { upgraded, downgraded, unchanged };
}

/**
 * Track and update storage usage across organizations
 */
export async function updateStorageUsage(ctx: BillingContext): Promise<{
  updated: number;
}> {
  const db = ctx.db;
  const now = new Date();
  let updated = 0;

  console.log('[BILLING] Updating storage usage...');

  // Get all active organizations
  const organizations = await db.query.organization.findMany({
    where: eq(organization.status, 'active'),
  });

  for (const org of organizations) {
    try {
      // Calculate storage used by organization users
      // This would integrate with your storage tracking system
      // For now, we'll just update the timestamp

      // TODO: Actually calculate storage from user mailboxes
      // const storageUsed = await calculateOrganizationStorage(org.id);

      await db
        .update(organization)
        .set({
          updatedAt: now,
        })
        .where(eq(organization.id, org.id));

      updated++;
    } catch (error) {
      console.error(`[BILLING] Error updating storage for organization ${org.id}:`, error);
    }
  }

  // Update partner storage pool usage
  const partners = await db.query.partner.findMany({
    where: eq(partner.status, 'active'),
  });

  for (const partnerData of partners) {
    try {
      // Sum up storage used by all partner organizations
      const orgStorageResult = await db
        .select({
          totalUsed: sql`COALESCE(SUM(CAST(${organization.usedStorageBytes} AS BIGINT)), 0)`,
        })
        .from(organization)
        .where(eq(organization.partnerId, partnerData.id));

      const totalUsed = orgStorageResult[0]?.totalUsed || '0';

      await db
        .update(partner)
        .set({
          usedStorageBytes: totalUsed.toString(),
          updatedAt: now,
        })
        .where(eq(partner.id, partnerData.id));
    } catch (error) {
      console.error(`[BILLING] Error updating storage for partner ${partnerData.id}:`, error);
    }
  }

  console.log(`[BILLING] Storage usage update complete. Updated: ${updated} organizations`);
  return { updated };
}

/**
 * Main billing worker entry point
 * This should be called by a scheduled task (e.g., Cloudflare Cron Trigger)
 */
export async function runBillingWorker(ctx: BillingContext): Promise<{
  invoices: { generated: number; errors: string[] };
  overdue: { processed: number; suspended: number };
  tiers: { upgraded: number; downgraded: number; unchanged: number };
  storage: { updated: number };
}> {
  console.log('[BILLING WORKER] Starting billing worker...');
  const startTime = Date.now();

  const results = {
    invoices: await generateMonthlyInvoices(ctx),
    overdue: await processOverdueInvoices(ctx),
    tiers: await evaluatePartnerTiers(ctx),
    storage: await updateStorageUsage(ctx),
  };

  const duration = Date.now() - startTime;
  console.log(`[BILLING WORKER] Complete in ${duration}ms`);
  console.log('[BILLING WORKER] Results:', JSON.stringify(results, null, 2));

  return results;
}

/**
 * Export individual functions for testing or selective execution
 */
export const billingTasks = {
  generateMonthlyInvoices,
  processOverdueInvoices,
  evaluatePartnerTiers,
  updateStorageUsage,
};
