# Nubo Admin, Partner & Workspace Dashboard Implementation Plan

## Overview

This document outlines the implementation plan for the B2B enterprise platform consisting of three dashboards:
1. **Admin Dashboard** - For Nubo team to manage everything
2. **Partner Dashboard** - For resellers to manage their customers
3. **Workspace Dashboard** - For organizations to manage their users

## Architecture

### Project Structure
```
apps/
├── mail/                    # Existing frontend
├── server/                  # Existing backend
├── admin/                   # NEW: Admin dashboard frontend
├── partner/                 # NEW: Partner dashboard frontend
├── workspace/               # NEW: Workspace dashboard frontend
└── billing-worker/          # NEW: Cloudflare Worker for billing cron jobs
```

### User Hierarchy
```
Admin (Nubo Team)
├── Partners (Resellers)
│   └── Organizations (Partner's Customers)
│       └── Users (Email accounts)
└── Direct Organizations (Retail Customers)
    └── Users (Email accounts)
```

---

## Phase 1: Database Schema

### New Tables

#### 1. Partners & Partnership
```sql
-- Partnership applications
CREATE TABLE partnership_application (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  company_name VARCHAR(255) NOT NULL,
  company_website VARCHAR(500),
  company_address TEXT,
  company_gst VARCHAR(50),
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  expected_monthly_sales DECIMAL(15,2),
  business_description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Approved partners
CREATE TABLE partner (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  application_id UUID REFERENCES partnership_application(id),
  company_name VARCHAR(255) NOT NULL,
  company_website VARCHAR(500),
  company_address TEXT,
  company_gst VARCHAR(50),
  tier VARCHAR(50) DEFAULT 'entry', -- entry, bronze, silver, gold
  discount_percentage DECIMAL(5,2) DEFAULT 20.00,
  allocated_storage_bytes BIGINT DEFAULT 0,
  used_storage_bytes BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  suspended_at TIMESTAMP,
  suspension_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner tier configuration (admin-editable)
CREATE TABLE partner_tier (
  id UUID PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE, -- entry, bronze, silver, gold
  display_name VARCHAR(100) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  min_quarterly_sales DECIMAL(15,2) NOT NULL,
  max_quarterly_sales DECIMAL(15,2), -- NULL for unlimited (gold)
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner quarterly sales tracking
CREATE TABLE partner_quarterly_sales (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partner(id),
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL, -- 1, 2, 3, 4
  total_sales DECIMAL(15,2) DEFAULT 0,
  tier_at_end VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(partner_id, year, quarter)
);

-- Partner storage purchases
CREATE TABLE partner_storage_purchase (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partner(id),
  storage_bytes BIGINT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  invoice_id UUID REFERENCES invoice(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. Organizations & Domains
```sql
-- Organizations
CREATE TABLE organization (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  partner_id UUID REFERENCES partner(id), -- NULL for direct customers
  owner_user_id UUID REFERENCES users(id),
  billing_email VARCHAR(255),
  billing_address TEXT,
  gst_number VARCHAR(50),
  is_retail BOOLEAN DEFAULT FALSE, -- TRUE if not via partner
  total_storage_bytes BIGINT DEFAULT 0,
  used_storage_bytes BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  suspended_at TIMESTAMP,
  suspension_reason TEXT,
  rocket_chat_workspace_id VARCHAR(255), -- Nubo Chat workspace
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Domains
CREATE TABLE organization_domain (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organization(id),
  domain_name VARCHAR(255) NOT NULL UNIQUE,
  is_primary BOOLEAN DEFAULT FALSE,
  dns_verified BOOLEAN DEFAULT FALSE,
  dns_verified_at TIMESTAMP,
  mx_record TEXT,
  spf_record TEXT,
  dkim_record TEXT,
  dmarc_record TEXT,
  archival_enabled BOOLEAN DEFAULT FALSE,
  archival_storage_bytes BIGINT DEFAULT 0,
  archival_used_bytes BIGINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, dns_pending, active, suspended
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Organization users (email accounts)
CREATE TABLE organization_user (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organization(id),
  domain_id UUID REFERENCES organization_domain(id),
  user_id UUID REFERENCES users(id), -- Link to main users table
  email_address VARCHAR(255) NOT NULL UNIQUE, -- user@domain.com
  nubo_username VARCHAR(255) UNIQUE, -- unique@nubo.email identifier
  display_name VARCHAR(255),
  mailbox_storage_bytes BIGINT DEFAULT 0,
  mailbox_used_bytes BIGINT DEFAULT 0,
  drive_storage_bytes BIGINT DEFAULT 0,
  drive_used_bytes BIGINT DEFAULT 0,
  imap_host VARCHAR(255),
  imap_port INTEGER,
  imap_username VARCHAR(255),
  imap_password_encrypted TEXT,
  smtp_host VARCHAR(255),
  smtp_port INTEGER,
  smtp_username VARCHAR(255),
  smtp_password_encrypted TEXT,
  has_pro_subscription BOOLEAN DEFAULT FALSE,
  pro_subscription_type VARCHAR(50), -- monthly, yearly
  pro_subscription_expires_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, suspended
  provisioned_by UUID REFERENCES users(id),
  provisioned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. Pricing & Plans
```sql
-- Plan categories
CREATE TABLE plan_category (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE, -- unlimited_user, limited_user, archival
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Plan variants (storage tiers)
CREATE TABLE plan_variant (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES plan_category(id),
  name VARCHAR(100) NOT NULL, -- 5gb, 10gb, etc.
  display_name VARCHAR(255) NOT NULL,
  storage_bytes BIGINT NOT NULL,
  retail_price_monthly DECIMAL(15,2) NOT NULL,
  retail_price_yearly DECIMAL(15,2) NOT NULL,
  partner_price_monthly DECIMAL(15,2) NOT NULL, -- Base price before tier discount
  partner_price_yearly DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Multi-currency pricing
CREATE TABLE plan_variant_price (
  id UUID PRIMARY KEY,
  variant_id UUID REFERENCES plan_variant(id),
  currency VARCHAR(10) NOT NULL,
  retail_price_monthly DECIMAL(15,2) NOT NULL,
  retail_price_yearly DECIMAL(15,2) NOT NULL,
  partner_price_monthly DECIMAL(15,2) NOT NULL,
  partner_price_yearly DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(variant_id, currency)
);

-- Nubo Pro subscription pricing
CREATE TABLE pro_subscription_price (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  monthly_price DECIMAL(15,2) NOT NULL,
  yearly_price DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Invoicing & Billing
```sql
-- Invoices
CREATE TABLE invoice (
  id UUID PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL, -- partner, organization, user
  partner_id UUID REFERENCES partner(id),
  organization_id UUID REFERENCES organization(id),
  billing_name VARCHAR(255),
  billing_email VARCHAR(255),
  billing_address TEXT,
  gst_number VARCHAR(50),
  subtotal DECIMAL(15,2) NOT NULL,
  gst_percentage DECIMAL(5,2) DEFAULT 18.00,
  gst_amount DECIMAL(15,2) NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  billing_period_start DATE,
  billing_period_end DATE,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
  paid_at TIMESTAMP,
  payment_method VARCHAR(50),
  razorpay_payment_id VARCHAR(255),
  razorpay_order_id VARCHAR(255),
  pdf_url TEXT,
  sent_at TIMESTAMP,
  reminder_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE invoice_line_item (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES invoice(id),
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) NOT NULL,
  plan_variant_id UUID REFERENCES plan_variant(id),
  organization_user_id UUID REFERENCES organization_user(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment transactions
CREATE TABLE payment_transaction (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES invoice(id),
  partner_id UUID REFERENCES partner(id),
  organization_id UUID REFERENCES organization(id),
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  razorpay_order_id VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  razorpay_signature VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed, refunded
  payment_method VARCHAR(50),
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Razorpay subscriptions (for recurring)
CREATE TABLE razorpay_subscription (
  id UUID PRIMARY KEY,
  razorpay_subscription_id VARCHAR(255) UNIQUE,
  partner_id UUID REFERENCES partner(id),
  organization_id UUID REFERENCES organization(id),
  organization_user_id UUID REFERENCES organization_user(id),
  plan_variant_id UUID REFERENCES plan_variant(id),
  billing_cycle VARCHAR(50), -- monthly, yearly
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'created', -- created, active, paused, cancelled
  next_billing_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. Archival
```sql
-- Email archival configuration
CREATE TABLE email_archival (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organization(id),
  domain_id UUID REFERENCES organization_domain(id),
  plan_variant_id UUID REFERENCES plan_variant(id),
  storage_bytes BIGINT NOT NULL,
  used_bytes BIGINT DEFAULT 0,
  retention_days INTEGER DEFAULT 2555, -- ~7 years default
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. Approval Requests
```sql
-- Approval request queue
CREATE TABLE approval_request (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- domain, user, storage, archival
  requestor_type VARCHAR(50) NOT NULL, -- partner, organization
  requestor_partner_id UUID REFERENCES partner(id),
  requestor_organization_id UUID REFERENCES organization(id),
  target_organization_id UUID REFERENCES organization(id),
  target_domain_id UUID REFERENCES organization_domain(id),
  target_user_id UUID REFERENCES organization_user(id),
  request_data JSONB NOT NULL, -- Flexible data storage
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. Admin Users
```sql
-- Admin roles
CREATE TABLE admin_role (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  permissions JSONB NOT NULL, -- Array of permission strings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin users
CREATE TABLE admin_user (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  role_id UUID REFERENCES admin_role(id),
  is_super_admin BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Phase 2: Backend Implementation

### New tRPC Routers

#### 1. Admin Router (`apps/server/src/trpc/routes/admin.ts`)
- Partner management (approve/reject applications, manage tiers)
- Organization management
- User provisioning approvals
- Pricing management
- Invoice management
- Storage allocation
- System settings

#### 2. Partner Router (`apps/server/src/trpc/routes/partner.ts`)
- Dashboard stats
- Organization CRUD
- Domain management
- User management requests
- Storage allocation to orgs
- Invoice viewing
- Storage purchase requests

#### 3. Workspace Router (`apps/server/src/trpc/routes/workspace.ts`)
- Organization dashboard
- Domain management
- User management requests
- Storage allocation to users
- Invoice viewing
- Pro subscription management

#### 4. Billing Router (`apps/server/src/trpc/routes/billing.ts`)
- Razorpay integration
- Invoice generation
- Payment processing
- Subscription management

### API Routes (`apps/server/src/routes/`)

#### 1. Razorpay Webhooks
- Payment success/failure handling
- Subscription lifecycle events

#### 2. Invoice PDF Generation
- Generate PDF invoices
- Email delivery

---

## Phase 3: Frontend Implementation

### Admin Dashboard (`apps/admin/`)
```
app/
├── (auth)/
│   └── login/
├── (dashboard)/
│   ├── layout.tsx
│   ├── page.tsx (Overview)
│   ├── partners/
│   │   ├── page.tsx (List)
│   │   ├── [id]/page.tsx (Detail)
│   │   └── applications/page.tsx
│   ├── organizations/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── approvals/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── pricing/
│   │   ├── page.tsx
│   │   ├── plans/page.tsx
│   │   └── partner-tiers/page.tsx
│   ├── invoices/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── storage/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
```

### Partner Dashboard (`apps/partner/`)
```
app/
├── (auth)/
│   └── login/
├── (onboarding)/
│   └── apply/page.tsx (Partnership form)
├── (dashboard)/
│   ├── layout.tsx
│   ├── page.tsx (Overview with storage progress)
│   ├── organizations/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx
│   │       ├── domains/page.tsx
│   │       └── users/page.tsx
│   ├── storage/
│   │   ├── page.tsx (Purchase storage)
│   │   └── allocate/page.tsx
│   ├── invoices/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── settings/
│       └── page.tsx
```

### Workspace Dashboard (`apps/workspace/`)
```
app/
├── (auth)/
│   └── login/
├── (onboarding)/
│   └── setup/page.tsx
├── (dashboard)/
│   ├── layout.tsx
│   ├── page.tsx (Overview)
│   ├── domains/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx
│   │       └── dns/page.tsx
│   ├── users/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── storage/
│   │   └── page.tsx
│   ├── archival/
│   │   └── page.tsx
│   ├── billing/
│   │   ├── page.tsx
│   │   └── invoices/page.tsx
│   └── settings/
│       └── page.tsx
```

---

## Phase 4: Billing Worker

### Cloudflare Worker Cron Jobs (`apps/billing-worker/`)

#### Monthly Invoice Generation (1st of each month)
1. Calculate usage for all partners and organizations
2. Generate invoice records
3. Generate PDF invoices
4. Send invoice emails

#### Payment Due Reminders (5th, 8th of each month)
1. Find unpaid invoices approaching due date
2. Send reminder emails

#### Account Suspension (11th of each month)
1. Find overdue invoices
2. Suspend partner/organization/user access
3. Send suspension notification

#### Quarterly Partner Tier Evaluation
1. Calculate quarterly sales for each partner
2. Upgrade/downgrade partner tiers
3. Notify partners of tier changes

---

## Phase 5: Integrations

### 1. Razorpay Integration
- Create orders for one-time payments
- Create subscriptions for recurring payments
- Handle webhooks for payment status
- Process refunds

### 2. Rocket.Chat Integration (Nubo Chat)
- Create workspace per organization
- Add/remove users from workspace
- Sync organization name

### 3. Email Integration
- Invoice delivery
- Payment receipts
- Suspension notices
- Partnership status updates

### 4. PDF Generation
- Invoice PDFs with GST breakdown
- Receipt PDFs

---

## Phase 6: Landing Page Updates

### Partnership Form on nubo.email
- Add partnership application form
- Company details collection
- Automatic application submission
- Status tracking

---

## Implementation Order

### Sprint 1: Foundation (Week 1-2)
1. Database schema creation
2. Basic tRPC routers setup
3. Authentication middleware for roles

### Sprint 2: Admin Dashboard (Week 3-4)
1. Admin frontend setup
2. Partner management
3. Pricing management
4. Basic approval workflow

### Sprint 3: Partner Dashboard (Week 5-6)
1. Partner frontend setup
2. Partnership application flow
3. Organization management
4. Storage management

### Sprint 4: Workspace Dashboard (Week 7-8)
1. Workspace frontend setup
2. Domain management
3. User management
4. Storage allocation

### Sprint 5: Billing (Week 9-10)
1. Razorpay integration
2. Invoice generation
3. Payment processing
4. Billing worker cron jobs

### Sprint 6: Polish & Integration (Week 11-12)
1. Rocket.Chat workspace integration
2. Email notifications
3. PDF generation
4. Testing & bug fixes

---

## Questions Resolved

| Question | Answer |
|----------|--------|
| Project structure | New apps in monorepo |
| Database | Same Neon PostgreSQL |
| Authentication | Same Better Auth with roles |
| Currency | Multi-currency support |
| Partner tier progression | Quarterly, with demotion |
| Partner storage | Pool-based allocation |
| User provisioning | Manual initially, API later |
| @nubo.email | Unique platform identifier |
| Nubo Pro | Existing features |
| Email archival | Compliance storage with retention |
| DNS | Display records + verification |
| Invoices | PDF + email + GST |
| Razorpay | One-time + recurring |
| Nubo Chat | Separate workspace per org |

---

## Default Pricing Structure (To be admin-configurable)

### Unlimited User Plan (INR)
| Storage | Monthly | Yearly |
|---------|---------|--------|
| 5 GB | ₹99 | ₹999 |
| 10 GB | ₹149 | ₹1,499 |
| 25 GB | ₹249 | ₹2,499 |
| 50 GB | ₹399 | ₹3,999 |
| 100 GB | ₹699 | ₹6,999 |
| 200 GB | ₹1,199 | ₹11,999 |
| 500 GB | ₹2,499 | ₹24,999 |

### Limited User Plan (INR)
| Storage | Monthly | Yearly |
|---------|---------|--------|
| 1 GB | ₹49 | ₹499 |
| 5 GB | ₹79 | ₹799 |
| 10 GB | ₹129 | ₹1,299 |
| 25 GB | ₹199 | ₹1,999 |
| 50 GB | ₹349 | ₹3,499 |
| 100 GB | ₹599 | ₹5,999 |

### Email Archival (INR)
| Storage | Monthly | Yearly |
|---------|---------|--------|
| 100 GB | ₹499 | ₹4,999 |
| 250 GB | ₹999 | ₹9,999 |
| 500 GB | ₹1,799 | ₹17,999 |
| 1 TB | ₹2,999 | ₹29,999 |
| 2 TB | ₹4,999 | ₹49,999 |

### Partner Tiers
| Tier | Discount | Quarterly Sales (INR) |
|------|----------|----------------------|
| Entry | 20% | < ₹10,000 |
| Bronze | 25% | ₹10,000 - ₹50,000 |
| Silver | 30% | ₹50,000 - ₹1,00,000 |
| Gold | 35% | > ₹1,00,000 |

---

## Next Steps

Please review this plan and confirm:
1. Is the database schema correct?
2. Is the pricing structure accurate?
3. Any features missing?
4. Ready to proceed with implementation?
