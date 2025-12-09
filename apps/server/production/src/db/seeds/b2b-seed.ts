/**
 * Seed file for B2B Enterprise tables
 * Run this after initial database setup to populate default values
 */
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from '../schema';

// Partner Tiers
const partnerTiers = [
  {
    id: 'tier_entry',
    name: 'entry',
    displayName: 'Entry Partner',
    discountPercentage: '20.00',
    minQuarterlySales: '0',
    maxQuarterlySales: '10000',
    sortOrder: 1,
  },
  {
    id: 'tier_bronze',
    name: 'bronze',
    displayName: 'Bronze Partner',
    discountPercentage: '25.00',
    minQuarterlySales: '10000',
    maxQuarterlySales: '50000',
    sortOrder: 2,
  },
  {
    id: 'tier_silver',
    name: 'silver',
    displayName: 'Silver Partner',
    discountPercentage: '30.00',
    minQuarterlySales: '50000',
    maxQuarterlySales: '100000',
    sortOrder: 3,
  },
  {
    id: 'tier_gold',
    name: 'gold',
    displayName: 'Gold Partner',
    discountPercentage: '35.00',
    minQuarterlySales: '100000',
    maxQuarterlySales: null, // Unlimited
    sortOrder: 4,
  },
];

// Plan Categories
const planCategories = [
  {
    id: 'cat_unlimited_user',
    name: 'unlimited_user',
    displayName: 'Unlimited User Plan',
    description: 'Create unlimited users with shared storage pool',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'cat_limited_user',
    name: 'limited_user',
    displayName: 'Limited User Plan',
    description: 'Per-user storage with individual limits',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: 'cat_archival',
    name: 'archival',
    displayName: 'Email Archival',
    description: 'Compliance email archival with retention policies',
    sortOrder: 3,
    isActive: true,
  },
];

// Helper to convert GB to bytes
const GB = (gb: number) => gb * 1024 * 1024 * 1024;
const TB = (tb: number) => tb * 1024 * 1024 * 1024 * 1024;

// Plan Variants - Unlimited User Plan
const unlimitedUserPlans = [
  { name: '5gb', displayName: '5 GB', storageBytes: GB(5), retailMonthly: 99, retailYearly: 999, partnerMonthly: 79, partnerYearly: 799 },
  { name: '10gb', displayName: '10 GB', storageBytes: GB(10), retailMonthly: 149, retailYearly: 1499, partnerMonthly: 119, partnerYearly: 1199 },
  { name: '25gb', displayName: '25 GB', storageBytes: GB(25), retailMonthly: 249, retailYearly: 2499, partnerMonthly: 199, partnerYearly: 1999 },
  { name: '50gb', displayName: '50 GB', storageBytes: GB(50), retailMonthly: 399, retailYearly: 3999, partnerMonthly: 319, partnerYearly: 3199 },
  { name: '100gb', displayName: '100 GB', storageBytes: GB(100), retailMonthly: 699, retailYearly: 6999, partnerMonthly: 559, partnerYearly: 5599 },
  { name: '200gb', displayName: '200 GB', storageBytes: GB(200), retailMonthly: 1199, retailYearly: 11999, partnerMonthly: 959, partnerYearly: 9599 },
  { name: '500gb', displayName: '500 GB', storageBytes: GB(500), retailMonthly: 2499, retailYearly: 24999, partnerMonthly: 1999, partnerYearly: 19999 },
];

// Plan Variants - Limited User Plan
const limitedUserPlans = [
  { name: '1gb', displayName: '1 GB', storageBytes: GB(1), retailMonthly: 49, retailYearly: 499, partnerMonthly: 39, partnerYearly: 399 },
  { name: '5gb', displayName: '5 GB', storageBytes: GB(5), retailMonthly: 79, retailYearly: 799, partnerMonthly: 63, partnerYearly: 639 },
  { name: '10gb', displayName: '10 GB', storageBytes: GB(10), retailMonthly: 129, retailYearly: 1299, partnerMonthly: 103, partnerYearly: 1039 },
  { name: '25gb', displayName: '25 GB', storageBytes: GB(25), retailMonthly: 199, retailYearly: 1999, partnerMonthly: 159, partnerYearly: 1599 },
  { name: '50gb', displayName: '50 GB', storageBytes: GB(50), retailMonthly: 349, retailYearly: 3499, partnerMonthly: 279, partnerYearly: 2799 },
  { name: '100gb', displayName: '100 GB', storageBytes: GB(100), retailMonthly: 599, retailYearly: 5999, partnerMonthly: 479, partnerYearly: 4799 },
];

// Plan Variants - Email Archival
const archivalPlans = [
  { name: '100gb', displayName: '100 GB', storageBytes: GB(100), retailMonthly: 499, retailYearly: 4999, partnerMonthly: 399, partnerYearly: 3999 },
  { name: '250gb', displayName: '250 GB', storageBytes: GB(250), retailMonthly: 999, retailYearly: 9999, partnerMonthly: 799, partnerYearly: 7999 },
  { name: '500gb', displayName: '500 GB', storageBytes: GB(500), retailMonthly: 1799, retailYearly: 17999, partnerMonthly: 1439, partnerYearly: 14399 },
  { name: '1tb', displayName: '1 TB', storageBytes: TB(1), retailMonthly: 2999, retailYearly: 29999, partnerMonthly: 2399, partnerYearly: 23999 },
  { name: '2tb', displayName: '2 TB', storageBytes: TB(2), retailMonthly: 4999, retailYearly: 49999, partnerMonthly: 3999, partnerYearly: 39999 },
];

// Admin Roles
const adminRoles = [
  {
    id: 'role_super_admin',
    name: 'super_admin',
    displayName: 'Super Admin',
    permissions: ['*'], // All permissions
  },
  {
    id: 'role_admin',
    name: 'admin',
    displayName: 'Admin',
    permissions: [
      'partners:read',
      'partners:write',
      'organizations:read',
      'organizations:write',
      'users:read',
      'users:write',
      'invoices:read',
      'invoices:write',
      'approvals:read',
      'approvals:write',
      'pricing:read',
      'settings:read',
    ],
  },
  {
    id: 'role_support',
    name: 'support',
    displayName: 'Support',
    permissions: [
      'partners:read',
      'organizations:read',
      'users:read',
      'invoices:read',
      'approvals:read',
    ],
  },
  {
    id: 'role_billing',
    name: 'billing',
    displayName: 'Billing',
    permissions: [
      'invoices:read',
      'invoices:write',
      'partners:read',
      'organizations:read',
    ],
  },
];

// Nubo Pro Subscription Pricing
const proSubscriptionPricing = [
  {
    id: 'pro_inr',
    name: 'Nubo Pro',
    monthlyPrice: '99',
    yearlyPrice: '999',
    currency: 'INR',
    isActive: true,
  },
  {
    id: 'pro_usd',
    name: 'Nubo Pro',
    monthlyPrice: '2.99',
    yearlyPrice: '29.99',
    currency: 'USD',
    isActive: true,
  },
];

export async function seedB2BTables(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log('🌱 Seeding B2B Enterprise tables...\n');

  try {
    // Seed Partner Tiers
    console.log('📊 Seeding partner tiers...');
    for (const tier of partnerTiers) {
      await db.insert(schema.partnerTier).values({
        ...tier,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${partnerTiers.length} partner tiers\n`);

    // Seed Admin Roles
    console.log('👤 Seeding admin roles...');
    for (const role of adminRoles) {
      await db.insert(schema.adminRole).values({
        ...role,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${adminRoles.length} admin roles\n`);

    // Seed Plan Categories
    console.log('📦 Seeding plan categories...');
    for (const category of planCategories) {
      await db.insert(schema.planCategory).values({
        ...category,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${planCategories.length} plan categories\n`);

    // Seed Plan Variants - Unlimited User
    console.log('💾 Seeding unlimited user plan variants...');
    let sortOrder = 1;
    for (const plan of unlimitedUserPlans) {
      await db.insert(schema.planVariant).values({
        id: `variant_unlimited_${plan.name}`,
        categoryId: 'cat_unlimited_user',
        name: plan.name,
        displayName: plan.displayName,
        storageBytes: plan.storageBytes,
        retailPriceMonthly: plan.retailMonthly.toString(),
        retailPriceYearly: plan.retailYearly.toString(),
        partnerPriceMonthly: plan.partnerMonthly.toString(),
        partnerPriceYearly: plan.partnerYearly.toString(),
        currency: 'INR',
        isActive: true,
        sortOrder: sortOrder++,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${unlimitedUserPlans.length} unlimited user plans\n`);

    // Seed Plan Variants - Limited User
    console.log('💾 Seeding limited user plan variants...');
    sortOrder = 1;
    for (const plan of limitedUserPlans) {
      await db.insert(schema.planVariant).values({
        id: `variant_limited_${plan.name}`,
        categoryId: 'cat_limited_user',
        name: plan.name,
        displayName: plan.displayName,
        storageBytes: plan.storageBytes,
        retailPriceMonthly: plan.retailMonthly.toString(),
        retailPriceYearly: plan.retailYearly.toString(),
        partnerPriceMonthly: plan.partnerMonthly.toString(),
        partnerPriceYearly: plan.partnerYearly.toString(),
        currency: 'INR',
        isActive: true,
        sortOrder: sortOrder++,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${limitedUserPlans.length} limited user plans\n`);

    // Seed Plan Variants - Archival
    console.log('💾 Seeding archival plan variants...');
    sortOrder = 1;
    for (const plan of archivalPlans) {
      await db.insert(schema.planVariant).values({
        id: `variant_archival_${plan.name}`,
        categoryId: 'cat_archival',
        name: plan.name,
        displayName: plan.displayName,
        storageBytes: plan.storageBytes,
        retailPriceMonthly: plan.retailMonthly.toString(),
        retailPriceYearly: plan.retailYearly.toString(),
        partnerPriceMonthly: plan.partnerMonthly.toString(),
        partnerPriceYearly: plan.partnerYearly.toString(),
        currency: 'INR',
        isActive: true,
        sortOrder: sortOrder++,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${archivalPlans.length} archival plans\n`);

    // Seed Pro Subscription Pricing
    console.log('⭐ Seeding Nubo Pro subscription pricing...');
    for (const pricing of proSubscriptionPricing) {
      await db.insert(schema.proSubscriptionPrice).values({
        ...pricing,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Inserted ${proSubscriptionPricing.length} pro subscription prices\n`);

    console.log('✅ B2B Enterprise tables seeded successfully!\n');
  } catch (error) {
    console.error('❌ Error seeding B2B tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  seedB2BTables(databaseUrl).catch(console.error);
}
