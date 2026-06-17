import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { setDoc, doc } from 'firebase/firestore';
import { DecryptedOutwardInvoice, InwardInvoice, InvoiceItem, StaffProfile, Medicine, Doctor, DecryptedPrescription } from '../types';
import { Plus, Trash2, Calendar, FileType, CheckCircle, ShieldAlert, ArrowRight, UserCheck } from 'lucide-react';

interface InvoicesManagerProps {
  staffProfile: StaffProfile | null;
  outwardInvoices: DecryptedOutwardInvoice[];
  inwardInvoices: InwardInvoice[];
  departments: string[];
  medicines: Medicine[];
  doctors: Doctor[];
  draftPrescription: DecryptedPrescription | null;
  onClearDraftPrescription: () => void;
  onAddOutward: (invoice: {
    invoiceId?: string;
    patientName: string;
    patientId: string;
    patientContact: string;
    treatmentDescription: string;
    department: string;
    items: InvoiceItem[];
    subTotal: number;
    gstTotal: number;
    grandTotal: number;
    paymentMode: 'Cash' | 'PhonePe' | 'GooglePay' | 'UPI';
    invoiceDate: string;
    doctorId?: string;
    doctorName?: string;
  }) => Promise<void>;
  onAddInward: (invoice: {
    invoiceId?: string;
    vendorName: string;
    vendorGstin: string;
    department: string;
    items: InvoiceItem[];
    subTotal: number;
    gstTotal: number;
    grandTotal: number;
    paymentMode: 'Cash' | 'Bank Transfer' | 'UPI';
    paymentStatus: 'Paid' | 'Pending';
    invoiceDate: string;
  }) => Promise<void>;
  onNavigateToPrint: (invoiceId: string) => void;
}

const subStringWrap = (text: string, max: number): string => {
  if (!text) return '';
  return text.length > max ? text.substring(0, max) + '...' : text;
};

// Fuzzy matching module to check if a prescribed text matches active inventory items
const isFuzzyMatch = (medName: string, prescribedText: string): boolean => {
  const normMed = medName.toLowerCase();
  const normPrescribed = prescribedText.toLowerCase();
  if (normMed.includes(normPrescribed) || normPrescribed.includes(normMed)) return true;
  
  // Split by spaces and punctuation to get tokens
  const medTokens = normMed.split(/[^a-z0-9]/).filter(t => t.length > 3);
  const presTokens = normPrescribed.split(/[^a-z0-9]/).filter(t => t.length > 3);

  for (const pT of presTokens) {
    for (const mT of medTokens) {
      if (pT.includes(mT) || mT.includes(pT)) return true;
      
      // Look for a common substring of at least 5 characters
      if (pT.length >= 5 && mT.length >= 5) {
        for (let i = 0; i < pT.length - 4; i++) {
          const sub = pT.substring(i, i + 5);
          if (mT.includes(sub)) {
            return true;
          }
        }
      }
    }
  }
  return false;
};

export const InvoicesManager: React.FC<InvoicesManagerProps> = ({
  staffProfile,
  outwardInvoices,
  inwardInvoices,
  departments,
  medicines,
  doctors,
  draftPrescription,
  onClearDraftPrescription,
  onAddOutward,
  onAddInward,
  onNavigateToPrint,
}) => {
  const [activeTab, setActiveTab] = useState<'outward' | 'inward' | 'list'>('list');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // --- Outward Patient Billing Form States ---
  const [outwardInvoiceId, setOutwardInvoiceId] = useState<string>('OUT_' + Math.random().toString(36).substring(2, 9).toUpperCase());
  const [patientName, setPatientName] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [patientContact, setPatientContact] = useState<string>('');
  const [treatmentDescription, setTreatmentDescription] = useState<string>('');
  const [outwardDept, setOutwardDept] = useState<string>('Outpatient (OPD)');
  const [outwardPaymentMode, setOutwardPaymentMode] = useState<'Cash' | 'PhonePe' | 'GooglePay' | 'UPI'>('UPI');
  const [outwardDate, setOutwardDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  const isOutwardIdTaken = outwardInvoices.some(inv => inv.invoiceId.toUpperCase() === outwardInvoiceId.trim().toUpperCase());

  // Items state
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: 'General Doctor Consultation Fee', quantity: 1, unitPrice: 500, gstRate: 0, gstAmount: 0, total: 500 }
  ]);

  // Detected matching medicines from prescription
  const [detectedMeds, setDetectedMeds] = useState<Medicine[]>([]);

  // Function to add a matched medicine directly to the items bill
  const addPrescribedMedToItems = (med: Medicine, qty: number) => {
    if (med.stock < qty) {
      alert(`Limit exceeded! Only ${med.stock} unit(s) of ${med.name} are available.`);
      return;
    }
    
    const gstAmount = Math.round((med.price * qty * (med.gstRate / 100)) * 100) / 100;
    const itemTotal = (med.price * qty) + gstAmount;

    const newItem: InvoiceItem = {
      id: med.medicineId,
      description: `[💊 Stock: ${med.code}] ${med.name}`,
      quantity: qty,
      unitPrice: med.price,
      gstRate: med.gstRate,
      gstAmount,
      total: itemTotal
    };

    setItems(prev => {
      // Remove placeholder first
      const filtered = prev.filter(item => item.id !== '1');
      // If already added, replace/update its quantity
      const existingIdx = filtered.findIndex(item => item.id === med.medicineId);
      if (existingIdx !== -1) {
        const updated = [...filtered];
        const newQty = qty; // overwrite with new user-specified qty
        const newGstAmount = Math.round((med.price * newQty * (med.gstRate / 100)) * 100) / 100;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          gstAmount: newGstAmount,
          total: (med.price * newQty) + newGstAmount
        };
        return updated;
      }
      return [...filtered, newItem];
    });
  };

  const lastProcessedPresIdRef = useRef<string | null>(null);

  // Synchronize prescription drafts and find matching medicines in inventory
  useEffect(() => {
    if (draftPrescription) {
      if (lastProcessedPresIdRef.current === draftPrescription.prescriptionId) {
        // Already loaded this same prescription, prevent erasing user's changes
        return;
      }
      lastProcessedPresIdRef.current = draftPrescription.prescriptionId;

      setActiveTab('outward');
      setPatientName(draftPrescription.patientName || '');
      setPatientId(draftPrescription.patientId || '');
      setPatientContact(draftPrescription.patientContact || '+91 ');
      setTreatmentDescription(
        `Diagnosis: ${draftPrescription.diagnosis || ''}. Medications: ${draftPrescription.medications || ''}. Notes: ${draftPrescription.clinicNotes || ''}`
      );
      setSelectedDoctorId(draftPrescription.doctorId || '');
      
      const dept = draftPrescription.department || 'Outpatient (OPD)';
      setOutwardDept(dept);

      // Create consultation item if consultationFee > 0
      const initialItems: InvoiceItem[] = [];
      if (draftPrescription.consultationFee > 0) {
        initialItems.push({
          id: 'CONSULT_FEES',
          description: `🩺 Dr. ${draftPrescription.doctorName} Consultation Fee`,
          quantity: 1,
          unitPrice: draftPrescription.consultationFee,
          gstRate: 0,
          gstAmount: 0,
          total: draftPrescription.consultationFee
        });
      }

      // Find matching medicines in active inventory
      const matches: Medicine[] = [];
      if (draftPrescription.medications && medicines.length > 0) {
        // split by punctuation or symbols to check individual items
        const rawItemsList = draftPrescription.medications.split(/[,;\n+]/).map(t => t.trim()).filter(Boolean);
        for (const rawItem of rawItemsList) {
          // find any medicine in inventory that matches Raw prescribed advice
          const matchedMed = medicines.find(m => isFuzzyMatch(m.name, rawItem) || isFuzzyMatch(m.code, rawItem));
          if (matchedMed && !matches.some(m => m.medicineId === matchedMed.medicineId)) {
            matches.push(matchedMed);
          }
        }
      }
      setDetectedMeds(matches);

      // Auto-add matched medicines if any with a default quantity of 10
      const autoAddedMeds: InvoiceItem[] = [];
      for (const m of matches) {
        if (m.stock > 0) {
          const qty = Math.min(10, m.stock);
          const gstAmount = Math.round((m.price * qty * (m.gstRate / 100)) * 100) / 100;
          autoAddedMeds.push({
            id: m.medicineId,
            description: `[💊 Stock: ${m.code}] ${m.name}`,
            quantity: qty,
            unitPrice: m.price,
            gstRate: m.gstRate,
            gstAmount,
            total: (m.price * qty) + gstAmount
          });
        }
      }

      setItems(initialItems.length > 0 
        ? [...initialItems, ...autoAddedMeds] 
        : (autoAddedMeds.length > 0 ? autoAddedMeds : [
            { id: '1', description: 'General Doctor Consultation Fee', quantity: 1, unitPrice: 500, gstRate: 0, gstAmount: 0, total: 500 }
          ])
      );
    } else {
      // Clear ref if no draft prescription is active
      lastProcessedPresIdRef.current = null;
    }
  }, [draftPrescription, medicines]);

  // Item form states
  const [itemDesc, setItemDesc] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemGstRate, setItemGstRate] = useState<number>(12); // e.g. 5%, 12%, 18% Standard slabs
  const [itemType, setItemType] = useState<'custom' | 'medicine'>('custom');
  const [selectedMedId, setSelectedMedId] = useState<string>('');

  // --- Inward Procurement Expense States ---
  const [inwardInvoiceId, setInwardInvoiceId] = useState<string>('IN_' + Math.random().toString(36).substring(2, 9).toUpperCase());
  const [vendorName, setVendorName] = useState<string>('');
  const [vendorGstin, setVendorGstin] = useState<string>('');
  const [inwardDept, setInwardDept] = useState<string>('Pharmacy');
  const [inwardPaymentMode, setInwardPaymentMode] = useState<'Cash' | 'Bank Transfer' | 'UPI'>('Bank Transfer');
  const [inwardPaymentStatus, setInwardPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [inwardDate, setInwardDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isInwardIdTaken = inwardInvoices.some(inv => inv.invoiceId.toUpperCase() === inwardInvoiceId.trim().toUpperCase());

  // --- Helper calculations ---
  const calculateTotals = (currentItems: InvoiceItem[]) => {
    const subTotal = currentItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
    const gstTotal = currentItems.reduce((acc, item) => acc + item.gstAmount, 0);
    const grandTotal = subTotal + gstTotal;
    return { subTotal, gstTotal, grandTotal };
  };

  const handleAddItem = () => {
    let finalDesc = itemDesc;
    let finalId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString();
    let finalPrice = itemPrice;
    let finalGstRate = itemGstRate;

    if (itemType === 'medicine') {
      const selectedMed = medicines.find(m => m.medicineId === selectedMedId);
      if (!selectedMed) return;
      
      // Prevent selling more than what is available
      if (selectedMed.stock < itemQty) {
        alert(`Dispensary stock limit exceeded! Only ${selectedMed.stock} unit(s) of ${selectedMed.name} are currently available in inventory.`);
        return;
      }
      
      finalDesc = `[💊 Stock: ${selectedMed.code}] ${selectedMed.name}`;
      finalId = selectedMed.medicineId; // Directly map to medicineId to enable automatic inventory depletion
      finalPrice = selectedMed.price;
      finalGstRate = selectedMed.gstRate;
    }

    if (!finalDesc.trim() || itemQty <= 0 || finalPrice < 0) return;
    const gstAmount = Math.round((finalPrice * itemQty * (finalGstRate / 100)) * 100) / 100;
    const itemTotal = (finalPrice * itemQty) + gstAmount;

    const newItem: InvoiceItem = {
      id: finalId,
      description: finalDesc,
      quantity: itemQty,
      unitPrice: finalPrice,
      gstRate: finalGstRate,
      gstAmount,
      total: itemTotal
    };

    const nextItems = [...items, newItem];
    setItems(nextItems);

    // Clear inputs and reset forms
    setItemDesc('');
    setItemQty(1);
    setItemPrice(0);
    setSelectedMedId('');
    setItemType('custom');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const { subTotal, gstTotal, grandTotal } = calculateTotals(items);

  // --- Submissions ---
  const handleOutwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim() || !patientId.trim() || items.length === 0 || isOutwardIdTaken) return;
    setIsSubmitting(true);

    const matchedDoctor = doctors ? doctors.find(d => d.doctorId === selectedDoctorId) : null;
    const doctorName = matchedDoctor ? matchedDoctor.name : '';

    try {
      await onAddOutward({
        invoiceId: outwardInvoiceId.trim().toUpperCase(),
        patientName,
        patientId,
        patientContact,
        treatmentDescription,
        department: outwardDept,
        items,
        subTotal,
        gstTotal,
        grandTotal,
        paymentMode: outwardPaymentMode,
        invoiceDate: outwardDate,
        doctorId: selectedDoctorId,
        doctorName: doctorName
      });

      // Clear states and reset placeholder Invoice ID
      setPatientName('');
      setPatientId('');
      setPatientContact('');
      setTreatmentDescription('');
      setSelectedDoctorId('');
      setItems([{ id: '1', description: 'General Doctor Consultation Fee', quantity: 1, unitPrice: 500, gstRate: 0, gstAmount: 0, total: 500 }]);
      setOutwardInvoiceId('OUT_' + Math.random().toString(36).substring(2, 9).toUpperCase());

      // If this came from a prescription list, resolve the active draft prescription status in Firestore
      if (draftPrescription) {
        try {
          await setDoc(doc(db, 'prescriptions', draftPrescription.prescriptionId), {
            status: 'Completed'
          }, { merge: true });

          if (draftPrescription.consultationId) {
            await setDoc(doc(db, 'consultations', draftPrescription.consultationId), {
              status: 'Completed'
            }, { merge: true });
          }
        } catch (_presErr) {
          console.warn("Failed to mark prescription and consultation as completed:", _presErr);
        }
        onClearDraftPrescription();
      }

      setActiveTab('list');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim() || items.length === 0 || isInwardIdTaken) return;
    setIsSubmitting(true);
    try {
      await onAddInward({
        invoiceId: inwardInvoiceId.trim().toUpperCase(),
        vendorName,
        vendorGstin,
        department: inwardDept,
        items,
        subTotal,
        gstTotal,
        grandTotal,
        paymentMode: inwardPaymentMode,
        paymentStatus: inwardPaymentStatus,
        invoiceDate: inwardDate
      });

      // Clear states and reset placeholder Invoice ID
      setVendorName('');
      setVendorGstin('');
      setItems([{ id: '1', description: 'Procured Supply Entry', quantity: 1, unitPrice: 1000, gstRate: 12, gstAmount: 120, total: 1120 }]);
      setInwardInvoiceId('IN_' + Math.random().toString(36).substring(2, 9).toUpperCase());
      setActiveTab('list');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-fade-in" id="invoices-manager-box">
      {/* Visual Navigation Subtabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 px-6 py-1 gap-2 animate-fade-in" id="invoices-panel-tabs">
        <button
          onClick={() => { setActiveTab('list'); setItems([{ id: '1', description: 'General Doctor Consultation Fee', quantity: 1, unitPrice: 500, gstRate: 0, gstAmount: 0, total: 500 }]); }}
          className={`px-4 py-3 text-xs font-mono font-bold tracking-tight transition-colors border-b-2 ${activeTab === 'list' ? 'text-blue-600 border-blue-650' : 'text-slate-400 border-transparent hover:text-slate-700'}`}
        >
          📂 Ledger Receipts
        </button>
        {staffProfile?.role !== 'Pharmacist' && (
          <button
            onClick={() => setActiveTab('outward')}
            className={`px-4 py-3 text-xs font-mono font-bold tracking-tight transition-colors border-b-2 ${activeTab === 'outward' ? 'text-blue-600 border-blue-650' : 'text-slate-400 border-transparent hover:text-slate-700'}`}
          >
            + Outward Bill (Patient Intake)
          </button>
        )}
        {(staffProfile?.role === 'Admin' || staffProfile?.role === 'Pharmacist' || staffProfile?.role === 'CFO') && (
          <button
            onClick={() => { setActiveTab('inward'); setItems([{ id: '1', description: 'Pharmaceutical Supplies Entry', quantity: 1, unitPrice: 10000, gstRate: 12, gstAmount: 1200, total: 11200 }]); }}
            className={`px-4 py-3 text-xs font-mono font-bold tracking-tight transition-colors border-b-2 ${activeTab === 'inward' ? 'text-blue-600 border-blue-650' : 'text-slate-400 border-transparent hover:text-slate-700'}`}
          >
            + Inward Expense (Procurement)
          </button>
        )}
      </div>

      <div className="p-6">
        {/* VIEW 1: OUTWARD PATIENT INTAKE FORM */}
        {activeTab === 'outward' && (
          <form onSubmit={handleOutwardSubmit} className="space-y-6" id="form-outward-bill">
            {draftPrescription && (
              <div className="bg-blue-50 border border-blue-250 p-5 rounded-xl flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 font-bold text-sm mt-0.5 font-mono">
                      Rx
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Active EHR Prescription Draft Loaded
                      </span>
                      <p className="text-xs text-blue-700 font-semibold leading-relaxed mt-1">
                        Fulfilling medicines for patient <strong className="text-blue-950 font-bold">{draftPrescription.patientName}</strong> ({draftPrescription.patientId}). 
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1 font-medium bg-white/60 px-2 py-1 rounded-md border border-blue-100/50 inline-block">
                        🩺 Physician Prescribed Advice: <strong className="text-slate-800 font-bold">{draftPrescription.medications}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearDraftPrescription}
                    className="px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-white rounded-lg border border-blue-200 text-blue-650 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-sm transition-all shrink-0"
                  >
                    Clear Draft
                  </button>
                </div>

                {/* Match in Inventory display list */}
                <div className="border-t border-blue-200/50 pt-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-800 block mb-2">
                    🎯 Pharmacy matches identified in dispensary inventory:
                  </span>

                  {detectedMeds.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic bg-white/40 p-2.5 rounded-lg border border-slate-200/50">
                      No exact matches identified in current drug formulary. Please use the "Pharmacy Inventory" tab below to search and add medications manually.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {detectedMeds.map((med) => {
                        const inBillItem = items.find(item => item.id === med.medicineId);
                        
                        return (
                          <div key={med.medicineId} className="bg-white p-3 rounded-lg border border-blue-105 shadow-sm hover:shadow transition-all flex flex-col justify-between gap-2.5">
                            <div className="flex items-start justify-between gap-1.5">
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 font-sans">{med.name}</h4>
                                <span className="text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-600 px-1 py-0.5 rounded mr-1">
                                  {med.code}
                                </span>
                                <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${med.stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                  Stock: {med.stock}
                                </span>
                              </div>
                              <span className="text-xs font-mono font-semibold text-slate-700 shrink-0">
                                ₹{med.price} <span className="text-[9px] text-slate-400">/unit</span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 border-t border-slate-100/80 pt-2 shrink-0">
                              <span className="text-[10px] font-mono text-slate-400">
                                {inBillItem ? (
                                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                                    <CheckCircle size={12} className="inline" /> Active in Invoice x{inBillItem.quantity}
                                  </span>
                                ) : (
                                  <span>Adjust quantity:</span>
                                )}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max={med.stock}
                                  defaultValue={inBillItem ? inBillItem.quantity : 10}
                                  onChange={(e) => {
                                    const qty = parseInt(e.target.value) || 1;
                                    addPrescribedMedToItems(med, qty);
                                  }}
                                  id={`banner-qty-${med.medicineId}`}
                                  className="w-14 p-1 text-center font-mono font-bold text-xs border border-slate-200 outline-none focus:border-blue-400 rounded-md bg-slate-50 text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const inputEl = document.getElementById(`banner-qty-${med.medicineId}`) as HTMLInputElement | null;
                                    const qty = inputEl ? parseInt(inputEl.value) || 10 : 10;
                                    addPrescribedMedToItems(med, qty);
                                  }}
                                  disabled={med.stock <= 0}
                                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all ${inBillItem ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' : med.stock <= 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 shadow-sm'}`}
                                >
                                  {inBillItem ? 'Update Qty' : 'Add to Bill'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-emerald-50 p-4 border border-emerald-100 rounded-xl flex items-start gap-3">
              <ShieldAlert className="text-emerald-700 mt-0.5 shrink-0" size={16} />
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800">● HIPAA Secure Gate Active</span>
                <p className="text-[11px] text-emerald-700 font-medium leading-relaxed mt-0.5">
                  Patient name, ID, contact details, and clinic diagnoses will be transparently encrypted on the server before database commit. Only authorized personnel can decrypt.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
                  <span>Bill / Invoice Number</span>
                  {isOutwardIdTaken ? (
                    <span className="text-[8px] text-rose-600 font-bold lowercase bg-rose-50 px-1 py-0.5 rounded font-sans">taken</span>
                  ) : (
                    <span className="text-[8px] text-emerald-600 font-bold lowercase bg-emerald-50 px-1 py-0.5 rounded font-sans flex items-center gap-0.5">✓ ok</span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OUT-A19"
                  value={outwardInvoiceId}
                  onChange={(e) => setOutwardInvoiceId(e.target.value.toUpperCase())}
                  className={`w-full bg-slate-50 border ${isOutwardIdTaken ? 'border-rose-400 bg-rose-50/50 text-rose-800' : 'border-slate-200'} rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-black`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Patient Name (Identity)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Unique MRN / ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MRN-74128"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Contact Number</label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={patientContact}
                  onChange={(e) => setPatientContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Treatment and Diagnostics</label>
                <input
                  type="text"
                  placeholder="Cardiopulmonary screening / post clinical diagnostic assessment details"
                  value={treatmentDescription}
                  onChange={(e) => setTreatmentDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Assigned Department</label>
                <select
                  value={outwardDept}
                  onChange={(e) => setOutwardDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                >
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Attending Doctor / Staff</label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => {
                    setSelectedDoctorId(e.target.value);
                    const docInfo = doctors?.find(d => d.doctorId === e.target.value);
                    if (docInfo && docInfo.department) {
                      setOutwardDept(docInfo.department);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                >
                  <option value="">-- Dropdown Assignment --</option>
                  {doctors && doctors.map(d => (
                    <option key={d.doctorId} value={d.doctorId}>
                      {d.name} ({subStringWrap(d.specialty, 25)}) [{d.status}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* In-Bill Items Adding Subform */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50" id="bill-items-builder">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Tally Invoice Slabs & Rates</h3>
                
                {/* Custom/Medicine Toggle */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 w-fit shrink-0">
                  <button
                    type="button"
                    onClick={() => { setItemType('custom'); setSelectedMedId(''); setItemPrice(0); setItemGstRate(12); }}
                    className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all ${itemType === 'custom' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    📝 Service Fee
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('medicine');
                      if (medicines.length > 0) {
                        const firstInStock = medicines.find(m => m.stock > 0) || medicines[0];
                        setSelectedMedId(firstInStock.medicineId);
                        setItemPrice(firstInStock.price);
                        setItemGstRate(firstInStock.gstRate);
                      }
                    }}
                    className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all ${itemType === 'medicine' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    💊 Pharmacy Inventory
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-2">
                {itemType === 'medicine' ? (
                  <div className="md:col-span-5 font-sans">
                    <select
                      value={selectedMedId}
                      onChange={(e) => {
                        const medId = e.target.value;
                        setSelectedMedId(medId);
                        const selectedMed = medicines.find(m => m.medicineId === medId);
                        if (selectedMed) {
                          setItemPrice(selectedMed.price);
                          setItemGstRate(selectedMed.gstRate);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-sans font-medium"
                    >
                      <option value="">-- Select formulation --</option>
                      {medicines.map((med) => (
                        <option key={med.medicineId} value={med.medicineId}>
                          {med.name} ({med.code}) — {med.stock > 0 ? `₹${med.price} [Stock: ${med.stock}]` : 'OUT OF STOCK'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-5 font-sans">
                    <input
                      type="text"
                      placeholder="e.g. ECG Test/Antibiotic Pack"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-sans"
                    />
                  </div>
                )}
                
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={itemQty || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setItemQty(val);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-mono font-bold"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Rate Unit (₹)"
                    value={itemPrice || ''}
                    onChange={(e) => {
                      if (itemType !== 'medicine') {
                        setItemPrice(parseFloat(e.target.value) || 0);
                      }
                    }}
                    disabled={itemType === 'medicine'}
                    className={`w-full border rounded-lg p-2 text-xs outline-none font-mono font-bold ${itemType === 'medicine' ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-200 focus:border-blue-400'}`}
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    value={itemGstRate}
                    onChange={(e) => {
                      if (itemType !== 'medicine') {
                        setItemGstRate(parseInt(e.target.value) || 0);
                      }
                    }}
                    disabled={itemType === 'medicine'}
                    className={`w-full border rounded-lg p-2 text-xs outline-none font-mono font-bold ${itemType === 'medicine' ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-200 focus:border-blue-400'}`}
                  >
                    <option value={0}>0% Tax Exempt</option>
                    <option value={5}>5% GST Slab</option>
                    <option value={12}>12% Generic GST</option>
                    <option value={18}>18% Pharmacy/Med</option>
                    <option value={28}>28% Diagnostic Lab</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full p-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-750 rounded-lg flex items-center justify-center transition-all shadow-sm"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Real-time Inventory Verification Alert */}
              {itemType === 'medicine' && selectedMedId && (() => {
                const selectedMed = medicines.find(m => m.medicineId === selectedMedId);
                if (selectedMed) {
                  const isOut = selectedMed.stock <= 0;
                  const isLow = selectedMed.stock > 0 && selectedMed.stock < 20;
                  return (
                    <div className={`text-[10px] font-mono p-1 px-2.5 rounded-lg border flex items-center gap-1.5 ${isOut ? 'bg-rose-50 border-rose-100 text-rose-750 font-bold' : isLow ? 'bg-amber-50 border-amber-100 text-amber-750 font-bold' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-rose-500 animate-ping' : isLow ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                      {isOut 
                        ? `❌ Depleted Stock: ${selectedMed.name} matches 0 stock. Restock needed immediately.` 
                        : isLow 
                          ? `⚠️ Low Stock Warning: Only ${selectedMed.stock} unit(s) remaining in the dispensary ledger.` 
                          : `✓ Verified Dispensary Stock: ${selectedMed.stock} units available.`}
                    </div>
                  );
                }
                return null;
              })()}

              <div className="h-4" />

              {/* Items List */}
              {items.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs font-mono bg-white p-2.5 border border-slate-200 rounded-lg shadow-sm">
                      <div className="flex-1">
                        <p className="text-slate-800 font-bold font-sans">{item.description}</p>
                        <p className="text-[10px] text-slate-400 font-semibold font-mono">
                          {item.quantity} units x ₹{item.unitPrice.toLocaleString('en-IN')} | Tax @ {item.gstRate}% (₹{item.gstAmount})
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-800 font-black">₹{item.total.toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[10px] text-slate-400 py-3 font-mono font-semibold">No line items added yet. Consultation fee required by default.</p>
              )}
            </div>

            {/* Financial variables summary */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl" id="outward-total-box">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Gate Checkout Payment Mode</label>
                  <div className="flex gap-1.5">
                    {['Cash', 'PhonePe', 'GooglePay', 'UPI'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOutwardPaymentMode(mode as any)}
                        className={`flex-1 py-2 border font-mono font-bold text-[10px] text-center rounded-lg transition-all ${outwardPaymentMode === mode ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350 shadow-sm'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Invoice Issue Date</label>
                  <input
                    type="date"
                    value={outwardDate}
                    onChange={(e) => setOutwardDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-mono font-bold outline-none"
                  />
                </div>

                <div className="md:col-span-2 flex flex-col justify-end text-right font-mono" id="amount-tally-outward">
                  <span className="text-xs text-slate-550 font-semibold">Subtotal: ₹{subTotal.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-indigo-650 font-bold">GST collected (IGST/CGST): ₹{gstTotal.toLocaleString('en-IN')}</span>
                  <span className="text-sm font-black text-emerald-750 mt-1">Hospital Grand Total: ₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 border border-slate-200 hover:border-slate-350 text-slate-500 text-xs font-mono font-bold rounded-lg transition-colors bg-white shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || items.length === 0 || isOutwardIdTaken}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-40 shadow-sm"
              >
                {isSubmitting ? 'Securing Confidentially...' : isOutwardIdTaken ? '⚠️ Invoice Number Taken' : 'Commit Secure Outward Invoice'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 2: INWARD EXPENSE PROCUREMENT FORM */}
        {activeTab === 'inward' && (
          <form onSubmit={handleInwardSubmit} className="space-y-6" id="form-inward-bill">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
                  <span>Bill / Invoice Number</span>
                  {isInwardIdTaken ? (
                    <span className="text-[8px] text-rose-600 font-bold lowercase bg-rose-50 px-1 py-0.5 rounded font-sans">taken</span>
                  ) : (
                    <span className="text-[8px] text-emerald-600 font-bold lowercase bg-emerald-50 px-1 py-0.5 rounded font-sans flex items-center gap-0.5">✓ ok</span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IN-B128"
                  value={inwardInvoiceId}
                  onChange={(e) => setInwardInvoiceId(e.target.value.toUpperCase())}
                  className={`w-full bg-slate-50 border ${isInwardIdTaken ? 'border-rose-400 bg-rose-50/50 text-rose-800' : 'border-slate-200'} rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-black`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Supplier / Vendor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cipla Medical Supplies Ltd"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Vendor GSTIN Number</label>
                <input
                  type="text"
                  placeholder="e.g. 29AAAAA0000A1Z5"
                  value={vendorGstin}
                  onChange={(e) => setVendorGstin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono uppercase font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Operational Department Procurement (Expenditure center)</label>
                <select
                  value={inwardDept}
                  onChange={(e) => setInwardDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                >
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Procurement Date</label>
                <input
                  type="date"
                  value={inwardDate}
                  onChange={(e) => setInwardDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                />
              </div>
            </div>

            {/* Inward Items Builder */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50" id="inward-items-builder">
              <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-3">Procured Supplies Slabs</h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                <div className="md:col-span-5">
                  <input
                    type="text"
                    placeholder="e.g. Cardiac Catheter supplies / Pharmacy drugs batch"
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-sans"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={itemQty || ''}
                    onChange={(e) => setItemQty(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-mono font-bold"
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="UnitPrice (₹)"
                    value={itemPrice || ''}
                    onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-mono font-bold"
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    value={itemGstRate}
                    onChange={(e) => setItemGstRate(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-400 font-mono font-bold"
                  >
                    <option value={0}>0% Tax Exempt</option>
                    <option value={5}>5% Med Slabs</option>
                    <option value={12}>12% Pharmacy generic</option>
                    <option value={18}>18% High spec equipment</option>
                    <option value={28}>28% Diagnostic machines</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full p-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-750 rounded-lg flex items-center justify-center transition-all shadow-sm"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Items List */}
              {items.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs font-mono bg-white p-2.5 border border-slate-200 rounded-lg shadow-sm">
                      <div className="flex-1">
                        <p className="text-slate-800 font-bold font-sans">{item.description}</p>
                        <p className="text-[10px] text-slate-400 font-semibold font-mono">
                          {item.quantity} unit x ₹{item.unitPrice.toLocaleString('en-IN')} | GST {item.gstRate}% (₹{item.gstAmount})
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-800 font-extrabold">₹{item.total.toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[10px] text-slate-400 py-3 font-mono font-bold">No expense items logged. Add at least 1 supply entry line.</p>
              )}
            </div>

            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl" id="inward-total-box-details">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Expense Payment Method</label>
                  <select
                    value={inwardPaymentMode}
                    onChange={(e) => setInwardPaymentMode(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-bold outline-none"
                  >
                    <option value="Cash">Cash Drawer</option>
                    <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                    <option value="UPI">Corporate UPI ID</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2 font-bold">Invoice Payment Status</label>
                  <div className="flex gap-1.5">
                    {['Paid', 'Pending'].map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setInwardPaymentStatus(status as any)}
                        className={`flex-1 py-2 border font-mono font-bold text-[10px] text-center rounded-lg transition-all ${inwardPaymentStatus === status ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350 shadow-sm'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 flex flex-col justify-end text-right font-mono">
                  <span className="text-xs text-slate-550 font-semibold">Subtotal Excl. Tax: ₹{subTotal.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-amber-600 font-bold font-mono">Procured GST Tax: ₹{gstTotal.toLocaleString('en-IN')}</span>
                  <span className="text-sm font-black text-slate-800 mt-1">Inward Grand Total: ₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 border border-slate-200 hover:border-slate-350 text-slate-500 text-xs font-mono font-bold rounded-lg transition-colors bg-white shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || items.length === 0 || isInwardIdTaken}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-40 shadow-sm"
              >
                {isSubmitting ? 'Logging Purchase...' : isInwardIdTaken ? '⚠️ Invoice Number Taken' : 'Log Inward Procurement'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: LEDGER RECORDS TABLE */}
        {activeTab === 'list' && (
          <div className="space-y-6 animate-fade-in" id="invoice-records-list">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dual-record-tables">
              {/* Outward Bills Ledger */}
              <div className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-3">
                  <div>
                    <h3 className="text-xs font-mono font-black uppercase tracking-tight text-blue-600">Outward Bills Ledger (Patient Receipts)</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">Secure server decrypted records viewable only by authorized hospital staff.</p>
                  </div>
                  <Calendar size={14} className="text-slate-400 shrink-0" />
                </div>

                {outwardInvoices.length > 0 ? (
                   <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                     {outwardInvoices.map((inv) => (
                       <div key={inv.invoiceId} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-400 transition-all font-mono" id={`outward-rec-${inv.invoiceId}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase">{inv.department}</span>
                            <h4 className="text-xs font-bold text-slate-800 mt-2 font-sans flex items-center gap-1.5">
                              <span>{inv.patientName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({inv.patientId})</span>
                            </h4>
                            <p className="text-[10px] text-slate-600 mt-1 font-sans font-medium">{inv.treatmentDescription}</p>
                            {inv.doctorName && (
                              <p className="text-[9px] text-emerald-800 font-sans font-bold flex items-center gap-1.5 mt-1.5 bg-emerald-50/70 w-fit px-2 py-0.5 rounded-full border border-emerald-100 shadow-sm font-mono uppercase">
                                🩺 Attendant: {inv.doctorName}
                              </p>
                            )}
                            <p className="text-[9px] text-slate-400 mt-2 font-semibold font-mono">
                              Contact: {inv.patientContact} | Issued on: {inv.invoiceDate}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-blue-600 font-mono">₹{inv.grandTotal.toLocaleString('en-IN')}</p>
                            <span className="text-[9px] text-slate-400 font-bold font-mono">Tax: ₹{inv.gstTotal.toLocaleString('en-IN')}</span>
                            <div className="mt-2">
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                                {inv.paymentMode}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 py-1.5 border-t border-slate-200/50 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold">Ref No: <span className="text-slate-800 font-extrabold">{inv.invoiceId}</span></span>
                          <button
                            onClick={() => onNavigateToPrint(inv.invoiceId)}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100/80 hover:text-blue-800 font-sans font-bold text-[10px] py-1 px-2.5 rounded-lg border border-blue-100 transition-all"
                          >
                            🖨️ View & Print Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[11px] text-slate-400 font-mono font-bold py-12">No patient billing occurrences recorded.</p>
                )}
              </div>

              {/* Inward Expenses Ledger */}
              <div className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-3">
                  <div>
                    <h3 className="text-xs font-mono font-black uppercase tracking-tight text-amber-600">Inward Expenses Ledger (Procurement Purchases)</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold font-sans">Business stock expenditures, equipment buying, and input GST credits.</p>
                  </div>
                  <FileType size={14} className="text-slate-400 shrink-0" />
                </div>

                {inwardInvoices.length > 0 ? (
                   <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                     {inwardInvoices.map((inv) => (
                       <div key={inv.invoiceId} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-amber-500 transition-all font-mono" id={`inward-rec-${inv.invoiceId}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-mono font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase">{inv.department}</span>
                            <h4 className="text-xs font-bold text-slate-800 mt-2 font-sans">{inv.vendorName}</h4>
                            <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold font-mono">GSTIN: {inv.vendorGstin || 'Exempt'}</p>
                            <p className="text-[9px] text-slate-400 mt-2 font-bold">Date Logged: {inv.invoiceDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-amber-600 font-mono">₹{inv.grandTotal.toLocaleString('en-IN')}</p>
                            <span className="text-[9px] text-slate-400 font-bold font-mono">GST Paid: ₹{inv.gstTotal.toLocaleString('en-IN')}</span>
                            <div className="mt-2.5 flex gap-1.5 justify-end">
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md font-bold">
                                {inv.paymentMode}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${inv.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {inv.paymentStatus}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 py-1.5 border-t border-slate-200/50 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold">Ref No: <span className="text-slate-800 font-extrabold">{inv.invoiceId}</span></span>
                          <button
                            onClick={() => onNavigateToPrint(inv.invoiceId)}
                            className="bg-amber-50 text-amber-700 hover:bg-amber-100/80 hover:text-amber-800 font-sans font-bold text-[10px] py-1 px-2.5 rounded-lg border border-amber-100 transition-all"
                          >
                            🖨️ View & Print Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[11px] text-slate-400 font-mono font-bold py-12">No vendor expenditures recorded.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
