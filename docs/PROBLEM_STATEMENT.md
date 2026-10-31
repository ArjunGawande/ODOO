# Problem statement: Brightloop subscription billing

Build a **subscription billing platform** for a fictional company, Brightloop Software, similar to Chargebee or Odoo Subscriptions. Brightloop earns money every month, but today it tracks everything in spreadsheets and by hand. The system should automate the whole cycle: **product → plan → quote → subscription → invoice → payment → reports**.

Each scene below is explained with one running example.

## 1. Sign-up, login and roles

**Requirements:**
- Each email can have only one account.
- The password must be **more than 8 characters** (so at least 9), with an uppercase letter, a lowercase letter and a special character.
- "Forgot password" sends a reset link to the registered email.

**Three roles:**
- **Admin:** full control. Only the admin can add staff and create discounts.
- **Internal staff:** handle day-to-day work with limited access.
- **Customer (portal):** sees only their own subscriptions and invoices.

*Example:* Sharma Traders signs up with `owner@sharma.in` and the password `Sharma@2026`. If someone else tries to register with the same email, the system rejects it.

## 2. Products and variants

A product has a name, type, sales price, cost price and notes. A variant changes the price.

*Example:* The admin adds the product **CloudCRM** at ₹1,000. Its "Odoo" brand variant adds ₹560, so that variant costs **₹1,560**.

## 3. Plans

A plan sets the price, the billing period (daily, weekly, monthly or yearly), the minimum quantity, and the start and end dates when it can be sold. For each plan, the admin chooses which options are allowed: auto-close at the end, close early, pause and renew.

*Example:* The "CloudCRM Monthly" plan bills monthly, needs at least 5 users, and is available from 1 Nov 2026 to 31 Dec 2027. It auto-closes when it ends and can be paused.

## 4. Quotation templates → subscriptions

A sales rep picks a **quotation template** that already contains the plan and product lines and is valid for a set number of days, such as 30. This saves building every offer from scratch.

Each subscription has:
- A number, such as SUB-0001
- A customer, a plan, a start date, an expiry date and payment terms
- Lines showing product, quantity, unit price, tax and amount

It moves through these states, and everyone can see the current one:
**Draft → Quotation → Confirmed → Active → Closed**

*Example:* SUB-0001 for Sharma Traders has 10 users of CloudCRM (Odoo variant) at ₹1,560 each, on Net 15 payment terms.

## 5. Discounts (admin only)

A discount can be a fixed amount or a percentage. Each rule can set a minimum purchase or quantity, start and end dates, and a usage limit. It can apply to specific products or to a whole subscription. Once it applies, it should appear on invoices automatically and stop by itself when it expires or reaches its limit.

*Example:* "BULK10" gives 10% off when the quantity is 10 or more, is valid until 31 Mar 2027, and can be used at most 50 times. SUB-0001 has 10 users, so it qualifies.

## 6. Billing day

The system generates invoices automatically from active subscriptions. Taxes come from rules the admin has set, and an invoice moves through **Draft → Confirmed → Paid**. The team can confirm, cancel, send or print any invoice.

*Example:* The invoice for SUB-0001:

| Item | Amount |
|---|---|
| 10 × ₹1,560 | ₹15,600 |
| BULK10 discount (10%) | −₹1,560 |
| Subtotal | ₹14,040 |
| GST 18% | ₹2,527.20 |
| **Total** | **₹16,567.20** |

**Key rule:** an invoice must never be billed twice or skipped. In practice, store the "next invoice date" on each subscription, and add a unique check on subscription + billing period so a second run can't create a duplicate.

## 7. Payments

Each payment records its method, amount, date and a note, and is linked to an invoice. The team should always be able to see which invoices are paid and which are outstanding.

*Example:* Sharma Traders pays ₹10,000 by UPI on 5 Nov, which makes the invoice partially paid. They pay ₹6,567.20 by bank transfer on 12 Nov, and the invoice becomes **Paid**. If nothing had arrived by the 15-day due date, the invoice would show as **Overdue**.

## 8. Finance dashboard

The finance lead needs one screen that shows:
- Active subscriptions
- Revenue received and amount still owed
- Payments
- Overdue invoices

It should have filters (by date, customer, plan) and summary cards. Every page must load in **under 2 seconds**, even with thousands of subscriptions. To achieve that, use database indexes and pagination, and compute totals in the database rather than in a loop.

## Core data tables

Users/Roles, Products, Variants, Plans, Quotation Templates, Subscriptions + Lines, Taxes, Discounts, Invoices + Lines, Payments.

A strong demo walks through exactly this Sharma Traders story from start to finish.
