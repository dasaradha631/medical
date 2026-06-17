# zero-Trust Architecture Security Specification

## Hospital Enterprise Financial System (MedLedger Secure)

This specification defines the Attribute-Based Access Control (ABAC) and encryption rules designed to enforce patient confidentiality under HIPAA-equivalent standard principles, and shield hospital financial ledger items from unauthorized operations.

---

## 1. Data Invariants & Security Gates

1. **Patient Data Isolation**: Only authenticated staff with valid operational roles (`Admin`, `Billing Clerk`, `Pharmacist`, `CFO`) can view outward invoices. The patient name, diagnostic information, contact detail, and government IDs MUST be encrypted at-rest using AES-256-CBC cipher with a secure master key stored server-side.
2. **Immutability of Ledger Logs**: Once an inward or outward invoice is logged, its financial amounts, GST/TAX and payment variables are immutable to prevent embezzlement, unless authorized by `Admin` or `CFO` via strict procedural guidelines.
3. **Implicit Auth Ownership validation**: A user creation or update rule MUST confirm that the incoming `uid` matches the user `request.auth.uid`. No staff member can assign their own high-privilege credentials like `CFO` or `Admin`. Initial bootstrap or administrative action is required to elevate roles.
4. **Temporal Authenticity**: All timestamps (`createdAt`, `updatedAt`) MUST align with `request.time` (the server's verified clock) to prevent temporal fraud (e.g. backdating records).

---

## 2. Threat Payloads (The "Dirty Dozen")

These 12 scenarios represent attempts to bypass system constraints. They are explicitly validated to fail safe by return of `PERMISSION_DENIED`.

1. **Unauthenticated Read Request**: Attempt by a non-logged-in browser to pull patient invoices.
2. **Unverified Staff Profile Attempt**: Attempt by a staff member whose email is not verified (`request.auth.token.email_verified == false`) to create a profile.
3. **Privilege Escalation on Signup**: A raw billing clerk signing up and writing `role: "Admin"` in their `staff_roles/{uid}` profile.
4. **PII Blanket Harvest Attempt**: Client attempts to list ALL patient invoices without filtration; rule-enforced `allow list` evaluates resource integrity immediately.
5. **Ledger Tampering**: A billing clerk attempts to update the `grandTotal` or `subTotal` of an existing patient bill.
6. **Fake Creation Origin**: A user trying to set a patient bill's `createdBy` property to another staff member's UID.
7. **Temporal Fraud (Backdating)**: Attempt to pass a client-side generated date from years ago into `createdAt` of an outward bill.
8. **Resource Exhaustion Attack (Poison ID)**: Injecting 2,500-character junk document IDs into the `outward_invoices/{invoiceId}` path to inflate hospital billing operations.
9. **Tax Slab Injection**: Posting an invoice with an invalid GST tax rate (e.g. negative values or 500% rate) to corrupt reporting.
10. **Shadow Key Update**: Attempt to update a patient's bill with a malicious key `isRefundedByBypass: true` that is not part of the allowed schema keys.
11. **Outcome Status Bypass (Terminal Lockup)**: Attempting to modify a transaction ledger once its status is marked "Received" or "Paid".
12. **Inward Invoice Alteration**: Supplier clerk trying to modify tax or vendor GSTIN on a committed purchase log.

---

## 3. Threat Verification Schema

The safety policies are written directly into Firestore security rules (`firestore.rules`). Safe state transitions are validated under strict rules.
