import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { env } from '../../env';
import { TRPCError } from '@trpc/server';
import {
  partner,
  invoice,
  invoiceLineItem,
  paymentTransaction,
  razorpaySubscription,
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Helper function to call Razorpay API
async function callRazorpayAPI(endpoint: string, method: string, body?: any) {
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[RAZORPAY B2B API ERROR] ${method} ${endpoint} - Status: ${response.status}`);
    console.error('[RAZORPAY B2B API ERROR] Response:', errorText);
    throw new Error(`Razorpay API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Generate unique invoice number
function generateInvoiceNumber(): string {
  const prefix = 'INV';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${year}${month}-${random}`;
}

// Calculate GST (18%)
function calculateGST(subtotal: number): { cgst: number; sgst: number; igst: number; total: number } {
  // For same state, split into CGST and SGST
  // For different state, use IGST
  // Simplified: using IGST for now
  const gstAmount = subtotal * 0.18;
  return {
    cgst: 0,
    sgst: 0,
    igst: gstAmount,
    total: gstAmount,
  };
}

export const razorpayB2BRouter = router({
  // Create order for storage purchase
  createStorageOrder: publicProcedure
    .input(
      z.object({
        partnerId: z.string(),
        storageSizeGB: z.number(),
        priceINR: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { partnerId, storageSizeGB, priceINR } = input;
      const db = ctx.db;

      // Verify partner exists
      const partnerData = await db.query.partner.findFirst({
        where: eq(partner.id, partnerId),
        with: { tier: true },
      });

      if (!partnerData) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Partner not found' });
      }

      // Apply partner discount
      const discountPercentage = partnerData.tier?.discountPercentage || 0;
      const discountedPrice = priceINR * (1 - discountPercentage / 100);

      // Calculate GST
      const gst = calculateGST(discountedPrice);
      const totalAmount = discountedPrice + gst.total;

      // Create Razorpay order (receipt max 40 chars)
      const shortId = partnerId.substring(0, 6);
      const timestamp = Date.now().toString(36);
      const receiptId = `st_${shortId}_${timestamp}`;
      const razorpayOrder = await callRazorpayAPI('/orders', 'POST', {
        amount: Math.round(totalAmount * 100), // Convert to paise
        currency: 'INR',
        receipt: receiptId,
        notes: {
          partnerId,
          storageSizeGB,
          type: 'storage_purchase',
        },
      });

      // Create invoice in database
      const invoiceNumber = generateInvoiceNumber();
      const dueDateStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]; // Format as YYYY-MM-DD for date column
      const newInvoice = await db
        .insert(invoice)
        .values({
          id: crypto.randomUUID(),
          invoiceNumber,
          partnerId,
          organizationId: null,
          type: 'partner', // partner storage purchase
          status: 'draft', // pending payment
          subtotal: discountedPrice.toFixed(2),
          gstAmount: gst.total.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          currency: 'INR',
          dueDate: dueDateStr,
          razorpayOrderId: razorpayOrder.id,
        })
        .returning();

      // Create line item
      await db.insert(invoiceLineItem).values({
        id: crypto.randomUUID(),
        invoiceId: newInvoice[0].id,
        description: `Storage Pool - ${storageSizeGB} GB`,
        quantity: 1,
        unitPrice: discountedPrice.toString(),
        totalPrice: discountedPrice.toString(),
        createdAt: new Date(),
      });

      return {
        orderId: razorpayOrder.id,
        invoiceId: newInvoice[0].id,
        invoiceNumber,
        amount: totalAmount,
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID,
        partnerName: partnerData.companyName,
        partnerEmail: partnerData.contactEmail,
      };
    }),

  // Create order for organization subscription
  createSubscriptionOrder: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        planVariantId: z.string(),
        userCount: z.number(),
        billingPeriod: z.enum(['monthly', 'yearly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, planVariantId, userCount, billingPeriod } = input;
      const db = ctx.db;

      // Get organization and related partner
      const org = await db.query.organization.findFirst({
        where: eq(organizationId, organizationId),
        with: {
          partner: { with: { tier: true } },
        },
      });

      if (!org) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      // Get plan variant pricing
      const planVariant = await db.query.planVariant.findFirst({
        where: eq(planVariantId, planVariantId),
      });

      if (!planVariant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan variant not found' });
      }

      // Calculate price
      const pricing = planVariant.pricing as any;
      const basePrice =
        billingPeriod === 'monthly' ? pricing.INR.monthly : pricing.INR.yearly;
      const subtotal = basePrice * userCount;

      // Apply partner discount
      const discountPercentage = org.partner?.tier?.discountPercentage || 0;
      const discountedPrice = subtotal * (1 - discountPercentage / 100);

      // Calculate GST
      const gst = calculateGST(discountedPrice);
      const totalAmount = discountedPrice + gst.total;

      // Create Razorpay order (receipt max 40 chars)
      const shortOrgId = organizationId.substring(0, 6);
      const subTimestamp = Date.now().toString(36);
      const subReceiptId = `sb_${shortOrgId}_${subTimestamp}`;
      const razorpayOrder = await callRazorpayAPI('/orders', 'POST', {
        amount: Math.round(totalAmount * 100), // Convert to paise
        currency: 'INR',
        receipt: subReceiptId,
        notes: {
          organizationId,
          planVariantId,
          userCount,
          billingPeriod,
          type: 'subscription',
        },
      });

      // Create invoice
      const invoiceNumber = generateInvoiceNumber();
      const subDueDateStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]; // Format as YYYY-MM-DD for date column
      const newInvoice = await db
        .insert(invoice)
        .values({
          id: crypto.randomUUID(),
          invoiceNumber,
          partnerId: org.partnerId,
          organizationId,
          type: 'organization', // organization subscription
          status: 'draft', // pending payment
          subtotal: discountedPrice.toFixed(2),
          gstAmount: gst.total.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          currency: 'INR',
          dueDate: subDueDateStr,
          razorpayOrderId: razorpayOrder.id,
        })
        .returning();

      // Create line item
      await db.insert(invoiceLineItem).values({
        id: crypto.randomUUID(),
        invoiceId: newInvoice[0].id,
        description: `${planVariant.displayName} - ${userCount} users (${billingPeriod})`,
        quantity: userCount,
        unitPrice: (discountedPrice / userCount).toString(),
        totalPrice: discountedPrice.toString(),
        createdAt: new Date(),
      });

      return {
        orderId: razorpayOrder.id,
        invoiceId: newInvoice[0].id,
        invoiceNumber,
        amount: totalAmount,
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID,
      };
    }),

  // Verify payment and update invoice status
  verifyPayment: publicProcedure
    .input(
      z.object({
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
        invoiceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature, invoiceId } = input;
      const db = ctx.db;

      // Verify signature
      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid payment signature' });
      }

      // Get payment details from Razorpay
      const paymentDetails = await callRazorpayAPI(`/payments/${razorpayPaymentId}`, 'GET');

      if (paymentDetails.status !== 'captured') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Payment not captured: ${paymentDetails.status}`,
        });
      }

      // Get invoice
      const invoiceData = await db.query.invoice.findFirst({
        where: eq(invoice.id, invoiceId),
      });

      if (!invoiceData) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
      }

      // Update invoice status
      await db
        .update(invoice)
        .set({
          status: 'paid',
          paidAt: new Date(),
          razorpayPaymentId,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, invoiceId));

      // Create payment transaction record
      await db.insert(paymentTransaction).values({
        id: crypto.randomUUID(),
        invoiceId,
        partnerId: invoiceData.partnerId,
        organizationId: invoiceData.organizationId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        amount: invoiceData.totalAmount,
        currency: invoiceData.currency || 'INR',
        status: 'success',
        paymentMethod: paymentDetails.method || 'unknown',
      });

      // Handle post-payment actions based on invoice type
      if (invoiceData.type === 'partner' && invoiceData.partnerId) {
        // Allocate storage to partner
        const orderDetails = paymentDetails.notes;
        if (orderDetails?.storageSizeGB) {
          const storageSizeBytes = BigInt(orderDetails.storageSizeGB) * BigInt(1024 * 1024 * 1024);
          const partnerData = await db.query.partner.findFirst({
            where: eq(partner.id, invoiceData.partnerId),
          });

          if (partnerData) {
            await db
              .update(partner)
              .set({
                allocatedStorageBytes: (
                  BigInt(partnerData.allocatedStorageBytes) + storageSizeBytes
                ).toString(),
                updatedAt: new Date(),
              })
              .where(eq(partner.id, invoiceData.partnerId));
          }
        }
      }

      return {
        success: true,
        invoiceId,
        paymentId: razorpayPaymentId,
        status: 'paid',
      };
    }),

  // Get partner invoices
  getPartnerInvoices: publicProcedure
    .input(
      z.object({
        partnerId: z.string(),
        status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { partnerId, status, page, limit } = input;
      const db = ctx.db;

      const whereConditions = [eq(invoice.partnerId, partnerId)];
      if (status) {
        whereConditions.push(eq(invoice.status, status));
      }

      const invoices = await db.query.invoice.findMany({
        where: and(...whereConditions),
        with: {
          lineItems: true,
        },
        orderBy: desc(invoice.createdAt),
        limit,
        offset: (page - 1) * limit,
      });

      return {
        invoices,
        total: invoices.length, // TODO: Add proper count
        page,
        limit,
        totalPages: Math.ceil(invoices.length / limit),
      };
    }),

  // Get organization invoices
  getOrganizationInvoices: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
        page: z.number().default(1),
        limit: z.number().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { organizationId, status, page, limit } = input;
      const db = ctx.db;

      const whereConditions = [eq(invoice.organizationId, organizationId)];
      if (status) {
        whereConditions.push(eq(invoice.status, status));
      }

      const invoices = await db.query.invoice.findMany({
        where: and(...whereConditions),
        with: {
          lineItems: true,
        },
        orderBy: desc(invoice.createdAt),
        limit,
        offset: (page - 1) * limit,
      });

      return {
        invoices,
        total: invoices.length,
        page,
        limit,
        totalPages: Math.ceil(invoices.length / limit),
      };
    }),

  // Create recurring subscription for organization
  createRecurringSubscription: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        planVariantId: z.string(),
        userCount: z.number(),
        billingPeriod: z.enum(['monthly', 'yearly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, planVariantId, userCount, billingPeriod } = input;
      const db = ctx.db;

      // Get organization and plan details
      const org = await db.query.organization.findFirst({
        where: eq(organizationId, organizationId),
        with: {
          partner: { with: { tier: true } },
        },
      });

      if (!org) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      const planVariant = await db.query.planVariant.findFirst({
        where: eq(planVariantId, planVariantId),
      });

      if (!planVariant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan variant not found' });
      }

      // Calculate pricing
      const pricing = planVariant.pricing as any;
      const basePrice =
        billingPeriod === 'monthly' ? pricing.INR.monthly : pricing.INR.yearly;
      const subtotal = basePrice * userCount;
      const discountPercentage = org.partner?.tier?.discountPercentage || 0;
      const discountedPrice = subtotal * (1 - discountPercentage / 100);
      const gst = calculateGST(discountedPrice);
      const totalAmount = discountedPrice + gst.total;

      // Create Razorpay subscription
      const interval = billingPeriod === 'monthly' ? 1 : 12;
      const period = 'monthly';

      // First create a plan for this specific pricing
      const planId = `plan_${organizationId}_${planVariantId}_${userCount}`.substring(0, 40);

      try {
        // Try to create the plan (will fail if exists, which is okay)
        await callRazorpayAPI('/plans', 'POST', {
          period,
          interval,
          item: {
            name: `${planVariant.displayName} - ${userCount} users`,
            amount: Math.round(totalAmount * 100),
            currency: 'INR',
            description: `Organization subscription for ${org.name}`,
          },
          notes: {
            organizationId,
            planVariantId,
            userCount,
          },
        });
      } catch {
        // Plan might already exist, continue
      }

      // Create subscription
      const razorpaySub = await callRazorpayAPI('/subscriptions', 'POST', {
        plan_id: planId,
        customer_notify: 1,
        quantity: 1,
        total_count: billingPeriod === 'monthly' ? 120 : 10, // 10 years max
        notes: {
          organizationId,
          planVariantId,
          userCount,
          partnerId: org.partnerId,
        },
      });

      // Store subscription in database
      await db.insert(razorpaySubscription).values({
        id: crypto.randomUUID(),
        organizationId,
        razorpaySubscriptionId: razorpaySub.id,
        razorpayPlanId: planId,
        planVariantId,
        status: 'created',
        quantity: userCount,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(
          Date.now() + (billingPeriod === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
        ),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        subscriptionId: razorpaySub.id,
        shortUrl: razorpaySub.short_url,
        status: razorpaySub.status,
        keyId: env.RAZORPAY_KEY_ID,
      };
    }),

  // Handle Razorpay webhook for B2B events
  handleWebhook: publicProcedure
    .input(
      z.object({
        body: z.string(),
        signature: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { body, signature } = input;
      const db = ctx.db;

      // Verify webhook signature
      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      if (expectedSignature !== signature) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid webhook signature' });
      }

      const event = JSON.parse(body);
      console.log('[RAZORPAY B2B WEBHOOK] Received:', event.event);

      switch (event.event) {
        case 'payment.captured': {
          const payment = event.payload.payment.entity;
          const orderId = payment.order_id;

          // Find and update invoice
          const invoiceData = await db.query.invoice.findFirst({
            where: eq(invoice.razorpayOrderId, orderId),
          });

          if (invoiceData) {
            await db
              .update(invoice)
              .set({
                status: 'paid',
                paidAt: new Date(),
                razorpayPaymentId: payment.id,
                updatedAt: new Date(),
              })
              .where(eq(invoice.id, invoiceData.id));

            // Handle post-payment allocation
            if (invoiceData.invoiceType === 'storage' && invoiceData.partnerId) {
              const storageSizeGB = payment.notes?.storageSizeGB;
              if (storageSizeGB) {
                const storageSizeBytes = BigInt(storageSizeGB) * BigInt(1024 * 1024 * 1024);
                const partnerData = await db.query.partner.findFirst({
                  where: eq(partner.id, invoiceData.partnerId),
                });

                if (partnerData) {
                  await db
                    .update(partner)
                    .set({
                      allocatedStorageBytes: (
                        BigInt(partnerData.allocatedStorageBytes) + storageSizeBytes
                      ).toString(),
                      updatedAt: new Date(),
                    })
                    .where(eq(partner.id, invoiceData.partnerId));
                }
              }
            }
          }
          break;
        }

        case 'subscription.activated': {
          const subscription = event.payload.subscription.entity;
          await db
            .update(razorpaySubscription)
            .set({
              status: 'active',
              currentPeriodStart: new Date(subscription.current_start * 1000),
              currentPeriodEnd: new Date(subscription.current_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(razorpaySubscription.razorpaySubscriptionId, subscription.id));
          break;
        }

        case 'subscription.charged': {
          const subscription = event.payload.subscription.entity;
          const payment = event.payload.payment.entity;

          // Update subscription period
          await db
            .update(razorpaySubscription)
            .set({
              currentPeriodStart: new Date(subscription.current_start * 1000),
              currentPeriodEnd: new Date(subscription.current_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(razorpaySubscription.razorpaySubscriptionId, subscription.id));

          // Get subscription details for invoice
          const subData = await db.query.razorpaySubscription.findFirst({
            where: eq(razorpaySubscription.razorpaySubscriptionId, subscription.id),
          });

          if (subData) {
            // Create invoice for this payment
            const invoiceNumber = generateInvoiceNumber();
            const amount = payment.amount / 100;
            const gst = calculateGST(amount * 0.8475); // Reverse calculate from total
            const subtotal = amount - gst.total;

            const newInvoice = await db
              .insert(invoice)
              .values({
                id: crypto.randomUUID(),
                invoiceNumber,
                partnerId: null,
                organizationId: subData.organizationId,
                invoiceType: 'subscription',
                status: 'paid',
                subtotal: subtotal.toString(),
                taxAmount: gst.total.toString(),
                totalAmount: amount.toString(),
                currency: 'INR',
                dueDate: new Date(),
                paidAt: new Date(),
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning();

            await db.insert(invoiceLineItem).values({
              id: crypto.randomUUID(),
              invoiceId: newInvoice[0].id,
              description: `Subscription renewal - ${subData.quantity} users`,
              quantity: subData.quantity || 1,
              unitPrice: (subtotal / (subData.quantity || 1)).toString(),
              totalPrice: subtotal.toString(),
              createdAt: new Date(),
            });
          }
          break;
        }

        case 'subscription.cancelled':
        case 'subscription.halted': {
          const subscription = event.payload.subscription.entity;
          await db
            .update(razorpaySubscription)
            .set({
              status: event.event === 'subscription.cancelled' ? 'cancelled' : 'halted',
              cancelledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(razorpaySubscription.razorpaySubscriptionId, subscription.id));
          break;
        }

        case 'invoice.paid': {
          // Mark invoice as paid if we have it
          const razorpayInvoice = event.payload.invoice.entity;
          if (razorpayInvoice.order_id) {
            await db
              .update(invoice)
              .set({
                status: 'paid',
                paidAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(invoice.razorpayOrderId, razorpayInvoice.order_id));
          }
          break;
        }
      }

      return { received: true };
    }),
});
