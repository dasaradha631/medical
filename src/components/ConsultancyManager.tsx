import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Doctor, StaffProfile, InvoiceItem } from '../types';
import { Plus, Search, Calendar, User, Clock, Coins, CheckCircle, ChevronRight, X, Printer, UserPlus, ClipboardList } from 'lucide-react';

// Compliance Firestore Error Interfaces
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Compliance Firestore Error Log: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ConsultancyManagerProps {
  staffProfile: StaffProfile | null;
  doctors: Doctor[];
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
  onSendToDoctor: (patient: {
    patientName: string;
    patientId: string;
    patientContact: string;
    doctorId: string;
    doctorName: string;
    department: string;
    consultationId: string;
  }) => void;
}

export interface Consultation {
  consultationId: string;
  patientName: string;
  patientId: string;
  patientContact: string;
  department: string;
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  paymentMode: 'Cash' | 'PhonePe' | 'GooglePay' | 'UPI';
  status: 'Pending Doctor' | 'Prescribed' | 'Completed';
  createdAt: string;
  createdBy: string;
}

export function ConsultancyManager({
  staffProfile,
  doctors,
  onAddOutward,
  onSendToDoctor
}: ConsultancyManagerProps) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Form input states
  const [patientName, setPatientName] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [patientContact, setPatientContact] = useState<string>('+91 ');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [consultationFee, setConsultationFee] = useState<number>(500);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'PhonePe' | 'GooglePay' | 'UPI'>('UPI');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active printing token
  const [activeTicket, setActiveTicket] = useState<Consultation | null>(null);

  // Generate standard random ID
  const generatePatientId = () => {
    setPatientId('PAT_' + Math.random().toString(36).substring(2, 7).toUpperCase());
  };

  useEffect(() => {
    generatePatientId();
  }, []);

  // Fetch real-time consultations from Firestore
  useEffect(() => {
    if (!auth.currentUser) return;

    setLoading(true);
    const unsub = onSnapshot(collection(db, 'consultations'), (snapshot) => {
      const list: Consultation[] = [];
      snapshot.forEach((docObj) => {
        list.push({ consultationId: docObj.id, ...docObj.data() } as Consultation);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setConsultations(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load consultations:", err);
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'consultations');
    });

    return () => unsub();
  }, [auth.currentUser]);

  const handleCreateConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (!patientName.trim()) {
      setErrorMsg("Please enter Patient Name");
      return;
    }
    if (!selectedDoctorId) {
      setErrorMsg("Please assign a Doctor");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const doctor = doctors.find(d => d.doctorId === selectedDoctorId);
    if (!doctor) {
      setErrorMsg("Assigned Doctor details not found");
      setSubmitting(false);
      return;
    }

    const consultationId = 'CONS_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const cleanContact = patientContact.trim() || '+91 ';

    const newConsultation: Consultation = {
      consultationId,
      patientName: patientName.trim(),
      patientId: patientId.trim() || 'PAT-GEN',
      patientContact: cleanContact,
      department: doctor.department || 'General Medicine',
      doctorId: doctor.doctorId,
      doctorName: doctor.name,
      consultationFee: Number(consultationFee) || 0,
      paymentMode,
      status: 'Pending Doctor',
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid
    };

    try {
      // 1. Save consultation ticket
      await setDoc(doc(db, 'consultations', consultationId), newConsultation);

      // 2. Log in the financial ledger immediately by adding a pre-paid consultation outward invoice
      if (newConsultation.consultationFee > 0) {
        const item: InvoiceItem = {
          id: 'CONSULT_FEES',
          description: `🩺 Consultation Intake Ticket [Doc: Dr. ${doctor.name}]`,
          quantity: 1,
          unitPrice: newConsultation.consultationFee,
          gstRate: 0,
          gstAmount: 0,
          total: newConsultation.consultationFee
        };

        const consultInvoiceId = 'OUT_CON_' + Math.random().toString(36).substring(2, 9).toUpperCase();

        await onAddOutward({
          invoiceId: consultInvoiceId,
          patientName: newConsultation.patientName,
          patientId: newConsultation.patientId,
          patientContact: newConsultation.patientContact,
          treatmentDescription: `Doctor consultation. Assigned: Dr. ${doctor.name} (${doctor.specialty})`,
          department: newConsultation.department,
          items: [item],
          subTotal: newConsultation.consultationFee,
          gstTotal: 0,
          grandTotal: newConsultation.consultationFee,
          paymentMode: newConsultation.paymentMode,
          invoiceDate: new Date().toISOString().split('T')[0],
          doctorId: doctor.doctorId,
          doctorName: doctor.name
        });
      }

      setSuccessMsg(`Patient ${newConsultation.patientName} registered successfully! A consultation receipt of ₹${newConsultation.consultationFee} was added to financial book.`);
      
      // Auto open printed ticket
      setActiveTicket(newConsultation);

      // Reset form fields
      setPatientName('');
      setPatientContact('+91 ');
      setSelectedDoctorId('');
      setConsultationFee(500);
      generatePatientId();
    } catch (err: any) {
      console.error("Consultation registration failed:", err);
      setErrorMsg("Failed to book consultation ticket: " + (err.message || err));
      handleFirestoreError(err, OperationType.WRITE, `consultations/${consultationId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelTicket = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this consultation entry?")) return;
    try {
      await deleteDoc(doc(db, 'consultations', id));
    } catch (err) {
      console.error("Cancel failed:", err);
      handleFirestoreError(err, OperationType.DELETE, `consultations/${id}`);
    }
  };

  const filteredConsultations = consultations.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.patientName.toLowerCase().includes(query) ||
      c.patientId.toLowerCase().includes(query) ||
      c.doctorName.toLowerCase().includes(query) ||
      c.department.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Overview stats header banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 font-sans relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-y-4 translate-x-4">
          <ClipboardList size={220} />
        </div>
        <div className="md:flex md:items-center md:justify-between relative z-10">
          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full uppercase border border-blue-500/20">
              Department 1: Front Desk Intake Portal
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white mt-2.5 font-sans">
              Patient Consultation Desk (Consultancy Form)
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Register coming patients, book the assigned physician consultation slots, process upfront doctors' entry fees, and queue profiles dynamically to clinical charts.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-4 font-mono">
            <div className="bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700/60 text-center">
              <span className="text-[9px] text-slate-400 block uppercase font-bold">Today Registered</span>
              <strong className="text-xl text-white font-black">
                {consultations.filter(c => c.createdAt.startsWith(new Date().toISOString().split('T')[0])).length}
              </strong>
            </div>
            <div className="bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700/60 text-center">
              <span className="text-[9px] text-emerald-400 block uppercase font-bold">Active Queue</span>
              <strong className="text-xl text-emerald-300 font-black">
                {consultations.filter(c => c.status === 'Pending Doctor').length}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Registration Form Segment */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm font-sans flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="text-blue-600" size={18} />
              <h3 className="text-sm font-bold text-slate-800 font-sans">1. Patient Check-In & Slot Booking</h3>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-lg text-xs font-medium mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3.5 rounded-lg text-xs leading-relaxed mb-4 font-sans font-medium">
                ✅ {successMsg}
              </div>
            )}

            <form onSubmit={handleCreateConsultation} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Full Name of Patient</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter patient complete name"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-800 rounded-lg p-2 pl-9 text-xs font-semibold outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Unique Patient ID</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full bg-slate-100 border border-slate-200 text-slate-800 rounded-lg p-2 text-xs font-mono font-bold outline-none cursor-not-allowed"
                      readOnly
                    />
                    <button
                      type="button"
                      onClick={generatePatientId}
                      className="px-2.5 bg-slate-150 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-mono font-bold transition-all"
                    >
                      Regen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Contact Contact (+91)</label>
                  <input
                    type="text"
                    required
                    value={patientContact}
                    onChange={(e) => setPatientContact(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-700 rounded-lg p-2 text-xs font-mono font-bold outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Assign Duty Doctor</label>
                <select
                  required
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-800 rounded-lg p-2 text-xs font-semibold outline-none transition-colors"
                >
                  <option value="">-- Choose Physician On-Duty --</option>
                  {doctors.map(docObj => (
                    <option key={docObj.doctorId} value={docObj.doctorId} disabled={docObj.status === 'On Leave'}>
                      Dr. {docObj.name} - {docObj.specialty} ({docObj.department}) {docObj.status === 'On Leave' ? ' [ON LEAVE]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDoctorId && (() => {
                const docObj = doctors.find(d => d.doctorId === selectedDoctorId);
                if (docObj) {
                  return (
                    <div className="bg-blue-50/50 p-2 text-[10px] text-blue-800 border border-blue-100/50 rounded-lg font-mono flex items-center justify-between">
                      <span>🏥 Assigned Department: <strong>{docObj.department}</strong></span>
                      <span className="bg-blue-100 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">{docObj.specialty}</span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Consultation Entry Fee (₹)</label>
                  <div className="relative">
                    <Coins size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="number"
                      required
                      min="0"
                      value={consultationFee}
                      onChange={(e) => setConsultationFee(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-800 rounded-lg p-2 pl-9 text-xs font-mono font-bold outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Billing Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e: any) => setPaymentMode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-800 rounded-lg p-2 text-xs font-mono font-bold outline-none transition-colors"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="PhonePe">PhonePe</option>
                    <option value="GooglePay">GooglePay</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-mono font-bold uppercase transition-all shadow-md hover:shadow border border-slate-800 flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? 'Registering Patient...' : 'Book Slot & Log to Ledger'}
              </button>
            </form>
          </div>
        </div>

        {/* Checked-In Patients Queue Segment */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm font-sans flex flex-col justify-between">
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="text-blue-600" size={18} />
                <h3 className="text-sm font-bold text-slate-800 font-sans">2. Clinician Queue & Active Sessions</h3>
              </div>
              <div className="relative w-full md:w-60">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter name, doctor, ID..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 text-slate-800 rounded-lg py-1.5 pl-9 pr-3 text-xs font-semibold outline-none transition-colors"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs font-mono text-slate-400">Loading active doctor appointment queues...</div>
            ) : filteredConsultations.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl mt-2">
                <p className="text-xs font-mono text-slate-400 font-semibold">No active patient consultation records found in queue.</p>
                <p className="text-[10px] text-slate-300 mt-1">Please use the Registration Form on the left to check-in.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-mono text-slate-400 uppercase font-black">
                      <th className="py-2.5 px-3">Patient Profile</th>
                      <th className="py-2.5 px-2">Assigned Doctor</th>
                      <th className="py-2.5 px-2 text-right">Fee Status</th>
                      <th className="py-2.5 px-2 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredConsultations.map((c) => (
                      <tr key={c.consultationId} className="hover:bg-slate-50/50 text-xs transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-700 block">{c.patientName}</span>
                          <span className="text-[10px] font-mono text-slate-400 font-bold">{c.patientId}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="font-semibold text-slate-600 block">Dr. {c.doctorName}</span>
                          <span className="text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-500 px-1 py-0.5 rounded mr-1">
                            {c.department}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-slate-800">
                          ₹{c.consultationFee}
                          <span className="block text-[8px] font-bold text-slate-400 leading-none">{c.paymentMode}</span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {c.status === 'Pending Doctor' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-50 text-amber-600 border border-amber-100 animate-pulse">
                              Pending Doctor
                            </span>
                          )}
                          {c.status === 'Prescribed' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-blue-50 text-blue-600 border border-blue-100">
                              Prescribed
                            </span>
                          )}
                          {c.status === 'Completed' && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                              Completed
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              title="Print Reception Ticket"
                              onClick={() => setActiveTicket(c)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-all rounded"
                            >
                              <Printer size={13} />
                            </button>

                            {c.status === 'Pending Doctor' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onSendToDoctor({
                                    patientName: c.patientName,
                                    patientId: c.patientId,
                                    patientContact: c.patientContact,
                                    doctorId: c.doctorId,
                                    doctorName: c.doctorName,
                                    department: c.department,
                                    consultationId: c.consultationId
                                  })}
                                  className="px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-blue-600 text-white rounded-md border border-blue-700 hover:bg-blue-700 hover:scale-[1.02] shadow-sm transition-all"
                                >
                                  Prescribe
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelTicket(c.consultationId)}
                                  className="text-slate-300 hover:text-rose-650 p-1 rounded transition-colors"
                                  title="Cancel Appointment"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 border rounded">
                                Handled
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ticket/Slip Modal component */}
      {activeTicket && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 font-sans" id="ticket-modal-overlay">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xl max-w-sm w-full mx-4 overflow-hidden relative" id="ticket-modal-content">
            <button
              onClick={() => setActiveTicket(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Simulated Printed Thermal Ticket layout */}
            <div className="border-4 border-slate-700 p-4 rounded-xl relative font-sans text-slate-800 bg-slate-50">
              <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">MEDICORE CLINIC</h3>
                <p className="text-[9px] text-slate-500 font-mono tracking-widest font-semibold">TOKEN SYSTEM & INTAKE</p>
                <div className="bg-slate-850 text-slate-800 text-xs font-mono font-bold inline-block px-3 py-1 rounded-md border border-slate-200 mt-2">
                  Token: #{activeTicket.consultationId.substring(5)}
                </div>
              </div>

              <div className="py-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Patient:</span>
                  <span className="text-slate-800 font-black text-right">{activeTicket.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Patient ID:</span>
                  <span className="text-slate-800 font-semibold">{activeTicket.patientId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Contact:</span>
                  <span className="text-slate-800 font-semibold">{activeTicket.patientContact}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Physician:</span>
                  <span className="text-slate-800 font-bold text-right">Dr. {activeTicket.doctorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Dept:</span>
                  <span className="text-slate-800 font-bold text-right">{activeTicket.department}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-300 pt-2 font-sans font-black">
                  <span className="text-slate-700">Intake Slot Fee:</span>
                  <span className="text-slate-950 text-sm">₹{activeTicket.consultationFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between leading-none text-[8.5px] font-bold text-slate-400">
                  <span>Method:</span>
                  <span>{activeTicket.paymentMode} - Paid</span>
                </div>
              </div>

              {/* Fake barcode block */}
              <div className="border-t-2 border-dashed border-slate-300 pt-3 flex flex-col items-center">
                <div className="flex gap-0.5 h-6 w-full max-w-[120px] bg-slate-900 justify-between px-1 shrink-0 opacity-80 mb-1">
                  {Array.from({ length: 25 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-white h-full"
                      style={{ width: `${(idx % 3 === 0) ? '2px' : (idx % 2 === 0) ? '1px' : '3px'}` }}
                    />
                  ))}
                </div>
                <span className="text-[8px] text-slate-400 block font-mono">Date: {new Date(activeTicket.createdAt).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-1.8 bg-slate-800 hover:bg-slate-750 text-white text-xs font-mono font-bold uppercase rounded-lg border border-slate-750 shadow flex items-center justify-center gap-2"
              >
                <Printer size={13} /> Print Slip
              </button>
              <button
                onClick={() => setActiveTicket(null)}
                className="flex-1 py-1.8 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-mono font-bold uppercase rounded-lg shadow-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
