/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StaffRole = 'Admin' | 'Billing Clerk' | 'Pharmacist' | 'CFO';

export interface StaffProfile {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  department: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number; // 0, 5, 12, 18 or 28
  gstAmount: number;
  total: number;
}

export interface InwardInvoice {
  invoiceId: string;
  vendorName: string;
  vendorGstin: string;
  items: InvoiceItem[];
  subTotal: number;
  gstTotal: number;
  grandTotal: number;
  department: string; // e.g. Pharmacy, Cardiology, General
  paymentMode: 'Cash' | 'Bank Transfer' | 'UPI';
  paymentStatus: 'Paid' | 'Pending';
  invoiceDate: string; // YYYY-MM-DD
  createdAt: string;
  createdBy: string;
}

export interface OutwardInvoice {
  invoiceId: string;
  patientNameEncrypted: string;
  patientIdEncrypted: string;
  patientContactEncrypted: string;
  treatmentDescriptionEncrypted: string;
  department: string; // e.g. Pharmacy, Cardiology, Outpatient (OPD), Inpatient (IPD), Radiology, Emergency
  items: InvoiceItem[];
  subTotal: number;
  gstTotal: number;
  grandTotal: number;
  paymentMode: 'Cash' | 'PhonePe' | 'GooglePay' | 'UPI';
  paymentStatus: 'Received' | 'Refunded';
  invoiceDate: string; // YYYY-MM-DD
  createdAt: string;
  createdBy: string;
  doctorId?: string;
  doctorName?: string;
}

// Decrypted outward invoice for authenticated UI usage
export interface DecryptedOutwardInvoice extends Omit<OutwardInvoice, 'patientNameEncrypted' | 'patientIdEncrypted' | 'patientContactEncrypted' | 'treatmentDescriptionEncrypted'> {
  patientName: string;
  patientId: string;
  patientContact: string;
  treatmentDescription: string;
}

export interface DailyLedgerSummary {
  summaryId: string; // YYYY-MM-DD_Department
  date: string; // YYYY-MM-DD
  department: string;
  totalInward: number;
  totalOutward: number;
  totalGstCollected: number;
  totalGstPaid: number;
  cashTotal: number;
  phonePayTotal: number;
  googlePayTotal: number;
  upiTotal: number;
  otherPayTotal: number; // Card, Bank Transfer, etc
  netRevenue: number;
  updatedAt: string;
}

export interface DepartmentLedgerAggregate {
  department: string;
  inwardTotal: number;
  outwardTotal: number;
  gstCollected: number;
  gstPaid: number;
  cashRevenue: number;
  upiRevenue: number;
  netPosition: number;
}

export interface Medicine {
  medicineId: string;
  name: string;
  code: string;
  category: string;
  stock: number;
  price: number;
  gstRate: number; // 0, 5, 12, 18 or 28
  expiryDate: string; // YYYY-MM-DD
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Doctor {
  doctorId: string;
  name: string;
  specialty: string; // e.g. Cardiologist, Gen Practitioner, Pharmacist, Nurse
  department: string; // e.g. Outpatient (OPD), Inpatient (IPD), Pharmacy, etc.
  phone: string;
  status: 'Active' | 'On Leave';
  createdAt: string;
  createdBy: string;
}

export interface Prescription {
  prescriptionId: string;
  patientNameEncrypted: string;
  patientIdEncrypted: string;
  patientContactEncrypted: string;
  symptomsEncrypted: string;
  diagnosisEncrypted: string;
  medications: string; // Text field of recommended medicines (e.g. Paracetamol, Ibuprofen)
  consultationFee: number;
  clinicNotes: string;
  doctorId: string;
  doctorName: string;
  department: string;
  status: 'Pending' | 'Billed' | 'Completed';
  createdAt: string;
  createdBy: string;
  consultationId?: string;
}

export interface DecryptedPrescription extends Omit<Prescription, 'patientNameEncrypted' | 'patientIdEncrypted' | 'patientContactEncrypted' | 'symptomsEncrypted' | 'diagnosisEncrypted'> {
  patientName: string;
  patientId: string;
  patientContact: string;
  symptoms: string;
  diagnosis: string;
}

