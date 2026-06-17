import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Prescription, DecryptedPrescription, Doctor, StaffProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  FileText, 
  CheckCircle, 
  Calendar, 
  User, 
  Clock, 
  Coins, 
  ChevronRight, 
  AlertCircle, 
  X, 
  Activity,
  HeartPulse,
  Syringe,
  ClipboardList
} from 'lucide-react';

interface PrescriptionsManagerProps {
  staffProfile: StaffProfile | null;
  doctors: Doctor[];
  onDraftBillFromPrescription: (prescription: DecryptedPrescription) => void;
  activeConsultation?: {
    patientName: string;
    patientId: string;
    patientContact: string;
    doctorId: string;
    doctorName: string;
    department: string;
    consultationId: string;
  } | null;
  onClearActiveConsultation?: () => void;
}

export function PrescriptionsManager({ 
  staffProfile, 
  doctors,
  onDraftBillFromPrescription,
  activeConsultation,
  onClearActiveConsultation
}: PrescriptionsManagerProps) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [decryptedPrescriptions, setDecryptedPrescriptions] = useState<DecryptedPrescription[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Input States
  const [patientName, setPatientName] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [patientContact, setPatientContact] = useState<string>('');
  const [symptoms, setSymptoms] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [medications, setMedications] = useState<string>('');
  const [consultationFee, setConsultationFee] = useState<number>(500);
  const [clinicNotes, setClinicNotes] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  // Auto-generate Patient ID helper
  const handleGenerateId = () => {
    setPatientId('PAT_' + Math.random().toString(36).substring(2, 6).toUpperCase());
  };

  useEffect(() => {
    if (!patientId) {
      handleGenerateId();
    }
  }, []);

  // Sync active consultation from intake portal
  useEffect(() => {
    if (activeConsultation) {
      setPatientName(activeConsultation.patientName || '');
      setPatientId(activeConsultation.patientId || '');
      setPatientContact(activeConsultation.patientContact || '+91 ');
      setSelectedDoctorId(activeConsultation.doctorId || '');
      setSymptoms('');
      setDiagnosis('');
      setMedications('');
      setClinicNotes('');
    }
  }, [activeConsultation]);

  // Sync real-time prescriptions
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsub = onSnapshot(collection(db, 'prescriptions'), async (snapshot) => {
      const list: Prescription[] = [];
      snapshot.forEach((docObj) => {
        list.push({ prescriptionId: docObj.id, ...docObj.data() } as Prescription);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPrescriptions(list);

      // Perform HIPAA Server-Side Decryption
      if (list.length > 0) {
        try {
          const response = await fetch('/api/prescription/decrypt-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prescriptions: list })
          });
          if (response.ok) {
            const result = await response.json();
            setDecryptedPrescriptions(result.decryptedPrescriptions || []);
          } else {
            // Plaintext fallback
            setDecryptedPrescriptions(list.map((p: any) => ({
              ...p,
              patientName: p.patientNameEncrypted || 'Secure Encrypted',
              patientId: p.patientIdEncrypted || 'SECURE_ID',
              patientContact: p.patientContactEncrypted || 'SECURE_CONTACT',
              symptoms: p.symptomsEncrypted || 'N/A',
              diagnosis: p.diagnosisEncrypted || 'N/A'
            })));
          }
        } catch (decryptErr) {
          console.error("Prescriptions decryption batch service call failed:", decryptErr);
        }
      } else {
        setDecryptedPrescriptions([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Prescriptions snapshot failed:", err);
      setErrorText("You do not have active read permission to look up patient EHR prescriptions.");
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleCreatePrescriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!patientName.trim()) {
      alert("Patient name is required.");
      return;
    }
    if (!selectedDoctorId) {
      alert("Please select a prescribing physician/attendant.");
      return;
    }

    setSubmitting(true);
    setErrorText(null);

    try {
      // 1. Call Secure Encryption API proxy for HIPAA/privacy compliance
      let patientNameEncrypted = patientName.trim();
      let patientIdEncrypted = patientId.trim() || 'PAT_' + Math.random().toString(36).substring(2, 6).toUpperCase();
      let patientContactEncrypted = patientContact.trim() || '+91 00000 00000';
      let symptomsEncrypted = symptoms.trim() || 'General assessment';
      let diagnosisEncrypted = diagnosis.trim() || 'Clinical evaluation guidelines';

      try {
        const entryResponse = await fetch('/api/prescription/encrypt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: patientName.trim(),
            patientId: patientIdEncrypted,
            contact: patientContactEncrypted,
            symptoms: symptomsEncrypted,
            diagnosis: diagnosisEncrypted
          })
        });

        if (entryResponse.ok) {
          const cipherData = await entryResponse.json();
          patientNameEncrypted = cipherData.patientNameEncrypted;
          patientIdEncrypted = cipherData.patientIdEncrypted;
          patientContactEncrypted = cipherData.patientContactEncrypted;
          symptomsEncrypted = cipherData.symptomsEncrypted;
          diagnosisEncrypted = cipherData.diagnosisEncrypted;
        }
      } catch (encErr) {
        console.warn("Server-side HIPAA encryption fell back to local store values:", encErr);
      }

      const selectedDoc = doctors.find(d => d.doctorId === selectedDoctorId);
      const docName = selectedDoc ? selectedDoc.name : 'Duty Officer';
      const docDept = selectedDoc ? selectedDoc.department : 'General OPD';

      const prId = 'PR_' + Math.random().toString(36).substring(2, 9).toUpperCase();

      // 2. Write to Firestore `prescriptions`
      const newPrescription: Prescription = {
        prescriptionId: prId,
        patientNameEncrypted,
        patientIdEncrypted,
        patientContactEncrypted,
        symptomsEncrypted,
        diagnosisEncrypted,
        medications: medications.trim(),
        consultationFee,
        clinicNotes: clinicNotes.trim(),
        doctorId: selectedDoctorId,
        doctorName: docName,
        department: docDept,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid,
        consultationId: activeConsultation?.consultationId || ''
      };

      await setDoc(doc(db, 'prescriptions', prId), newPrescription);

      // Complete checkout workflow on active intake queue slot
      if (activeConsultation) {
        await setDoc(doc(db, 'consultations', activeConsultation.consultationId), {
          status: 'Prescribed'
        }, { merge: true });
        if (onClearActiveConsultation) {
          onClearActiveConsultation();
        }
      }

      // Reset Form fields
      setPatientName('');
      setPatientContact('');
      setSymptoms('');
      setDiagnosis('');
      setMedications('');
      setConsultationFee(500);
      setClinicNotes('');
      setSelectedDoctorId('');
      handleGenerateId();

      alert(`Prescription for ${patientName} registered successfully!`);
    } catch (err) {
      console.error("Critical error while saving prescription:", err);
      setErrorText(`Action Denied: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete prescription for ${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'prescriptions', id));
    } catch (err) {
      console.error("Failed to delete prescription:", err);
      alert("Failed to delete prescription. Authorization required.");
    }
  };

  const getStatusColor = (status: 'Pending' | 'Billed' | 'Completed') => {
    switch (status) {
      case 'Pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Billed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const filteredPrescriptions = decryptedPrescriptions.filter(p => {
    const term = searchQuery.toLowerCase().trim();
    const nameMatch = p.patientName.toLowerCase().includes(term);
    const idMatch = p.patientId.toLowerCase().includes(term);
    const docMatch = p.doctorName.toLowerCase().includes(term);
    const medsMatch = p.medications.toLowerCase().includes(term);

    const matchesSearch = nameMatch || idMatch || docMatch || medsMatch;
    const matchesStatus = statusFilter === 'all' || p.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="prescriptions-dashboard-grid">
      
      {/* Left panel: Clinical Prescription Form */}
      <div className="lg:col-span-5 h-fit">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Prescribe Treatment</h2>
              <p className="text-[10px] text-slate-400 font-mono font-bold uppercase mt-0.2">EHR Doctor Prescription Module</p>
            </div>
          </div>

          {errorText && (
            <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          <form onSubmit={handleCreatePrescriptionSubmit} className="space-y-4">
            
            {/* Demographics Area */}
            <div className="space-y-3">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block border-l-2 border-blue-505 pl-1.5 mb-1">
                Patient Demographics
              </span>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Patient / Candidate Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nagaraju"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white font-sans font-semibold transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Patient Reg ID</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      placeholder="PAT_A4Y"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-mono font-bold outline-none focus:border-blue-400 focus:bg-white transition-all text-center"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateId}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-mono font-bold rounded-lg shrink-0 border border-slate-250 transition-colors"
                      title="Regenerate Registration Code"
                    >
                      Gen
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Patient Contact</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 9441234567"
                    value={patientContact}
                    onChange={(e) => setPatientContact(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Assessment and Symptoms */}
            <div className="space-y-3 pt-1">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block border-l-2 border-emerald-505 pl-1.5 mb-1">
                Clinical Diagnosis
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Symptoms / Complaints</label>
                  <input
                    type="text"
                    placeholder="e.g. Mild headache, fever"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Active Diagnosis</label>
                  <input
                    type="text"
                    placeholder="e.g. Viral Pharyngitis"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans"
                  />
                </div>
              </div>
            </div>

            {/* Prescribed Medications (separate instruction block) */}
            <div className="space-y-3 pt-1">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block border-l-2 border-pink-505 pl-1.5 mb-1 animate-pulse">
                Prescribed Drug Formula & Dosage *
              </span>
              <div>
                <textarea
                  rows={3}
                  required
                  placeholder="E.g. Paracetamol 650mg — 1-0-1 after food for 3 days&#10;Amoxicillin 500mg — 1 tab daily for 5 days"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono leading-relaxed"
                />
                <span className="text-[9px] text-slate-400 mt-1 block">Specify clear instructions for the pharmacy counter.</span>
              </div>
            </div>

            {/* Doctors assignment and fees */}
            <div className="space-y-3 pt-1">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block border-l-2 border-purple-505 pl-1.5 mb-1">
                Consultant & Ledger Slabs
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Consulting Physician *</label>
                  <select
                    required
                    value={selectedDoctorId}
                    onChange={(e) => {
                      setSelectedDoctorId(e.target.value);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold"
                  >
                    <option value="">-- Assign Doctor --</option>
                    {doctors.map(d => (
                      <option key={d.doctorId} value={d.doctorId}>
                        {d.name} ({d.specialty})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="500"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold outline-none focus:border-blue-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Extra Clinic / Advice Notes</label>
                <input
                  type="text"
                  placeholder="Rest advised, review after 3 days"
                  value={clinicNotes}
                  onChange={(e) => setClinicNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all font-sans"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-40 shadow-sm"
              >
                {submitting ? 'Registering EHR...' : '✍️ Complete & Write Prescription'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right panel: Active Practice Prescriptions Ledger */}
      <div className="lg:col-span-7 space-y-4">
        
        {/* Filtering & Toolbar Action Row */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search prescriptions by patient name, registration ID, drugs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans placeholder-slate-400 outline-none focus:border-blue-400 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="flex gap-2 shrink-0">
            {['all', 'pending', 'billed', 'completed'].map((tabVal) => (
              <button
                key={tabVal}
                onClick={() => setStatusFilter(tabVal)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-tight transition-colors ${statusFilter === tabVal ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
              >
                {tabVal}
              </button>
            ))}
          </div>
        </div>

        {/* Prescription Cards Ledger List */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Decrypting Secure EHR Records...</p>
          </div>
        ) : filteredPrescriptions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-400">
              <FileText size={18} />
            </div>
            <h3 className="text-xs font-bold text-slate-800 uppercase font-mono mt-2">No Active EHR Prescriptions</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans leading-relaxed">
              No decrypted medical prescriptions matches this selection criteria or registration queue. Write a new prescription to assign medications.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredPrescriptions.map((p) => (
                <motion.div
                  key={p.prescriptionId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors relative"
                  id={`prescription-card-${p.prescriptionId}`}
                >
                  
                  {/* Top segment: Patient basic info & Action Button */}
                  <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-150 text-slate-600 flex items-center justify-center">
                        <User size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800">{p.patientName}</h3>
                          <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold rounded-full uppercase tracking-wider ${getStatusColor(p.status)}`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[10px] text-slate-400 font-mono font-medium">
                          <span className="font-bold text-blue-600 uppercase">{p.patientId}</span>
                          <span>•</span>
                          <span>📞 {p.patientContact}</span>
                          <span>•</span>
                          <span>📅 {new Date(p.createdAt).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      {p.status === 'Pending' && (
                        <button
                          onClick={() => onDraftBillFromPrescription(p)}
                          className="px-3 py-1.5 bg-emerald-650 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-colors animate-pulse-once"
                          title="Fulfill Prescription and Draft Bill in Billing Screen"
                        >
                          🧾 Send to Billing
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDelete(p.prescriptionId, p.patientName)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-colors"
                        title="Delete Record"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Body Segment: Diagnosis & Symptoms - Fully decrypted */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-150 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">
                        <HeartPulse size={12} className="text-rose-500" />
                        <span>Clinical Assessment</span>
                      </div>
                      <p className="text-slate-700 font-medium">
                        <strong className="text-slate-400 font-normal">Diagnosis:</strong> {p.diagnosis}
                      </p>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        <strong className="text-slate-405 font-normal">Symptoms:</strong> {p.symptoms}
                      </p>
                    </div>

                    {/* Prescribed Drug formulas */}
                    <div className="bg-pink-50/30 rounded-xl p-3 border border-pink-100/70 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold text-pink-500 tracking-wider">
                        <Syringe size={12} />
                        <span>Suggested Pharmacotherapy</span>
                      </div>
                      <div className="text-slate-800 font-mono text-[11px] font-semibold whitespace-pre-line leading-relaxed">
                        {p.medications}
                      </div>
                    </div>
                  </div>

                  {/* Notes & Physician context stamp */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert size={12} className="text-emerald-600" />
                      <span>Clinic Notes: <strong className="text-slate-650 font-sans font-medium">{p.clinicNotes || "None"}</strong></span>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150">
                      <span>🩺 Prescribed by: <strong className="text-slate-700 font-bold">{p.doctorName}</strong></span>
                      <span>•</span>
                      <span>Clinic Fee: <strong className="text-blue-600 font-bold">₹{p.consultationFee}</strong></span>
                    </div>
                  </div>

                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

      </div>
    </div>
  );
}

// Small icon helper
function ShieldAlert({ className, size }: { className?: string; size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 16} 
      height={size || 16} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" fill="none" />
      <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" />
      <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" />
    </svg>
  );
}
