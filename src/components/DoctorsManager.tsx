import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Doctor, StaffProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Stethoscope, 
  Phone, 
  Award, 
  LayoutGrid,
  Database,
  X, 
  Check, 
  XOctagon,
  Filter,
  Users
} from 'lucide-react';

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
  console.error('Compliance Firestore Error Log (Doctors): ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface DoctorsManagerProps {
  staffProfile: StaffProfile | null;
  doctors: Doctor[];
}

export function DoctorsManager({ staffProfile, doctors: parentDoctors }: DoctorsManagerProps) {
  const [doctors, setDoctors] = useState<Doctor[]>(parentDoctors);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);

  // Add Form fields
  const [doctorName, setDoctorName] = useState<string>('');
  const [specialty, setSpecialty] = useState<string>('');
  const [department, setDepartment] = useState<string>('Outpatient (OPD)');
  const [phone, setPhone] = useState<string>('');
  const [status, setStatus] = useState<'Active' | 'On Leave'>('Active');

  useEffect(() => {
    setDoctors(parentDoctors);
  }, [parentDoctors]);

  const DEPARTMENTS = [
    'Outpatient (OPD)',
    'Inpatient (IPD)',
    'Pharmacy',
    'Cardiology',
    'Radiology',
    'Emergency'
  ];

  // Load list manually if not parsed from subscription (Double coverage)
  useEffect(() => {
    if (!auth.currentUser) return;
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'doctors'), (snapshot) => {
      const list: Doctor[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Doctor);
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setDoctors(list);
      setLoading(false);
      setErrorText(null);
    }, (err) => {
      console.error("Firestore doctors snapshot loading failed:", err);
      setErrorText("Missing or restrictive database permissions for Doctors collection.");
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'doctors');
    });

    return () => unsub();
  }, []);

  // Pre-seed mock values for beautiful presentation
  const handleSeedDoctors = async () => {
    if (!auth.currentUser) return;
    setSubmitLoading(true);
    setErrorText(null);

    const presetDoctorsList: Doctor[] = [
      {
        doctorId: 'DOC_DASARADHA',
        name: 'Dr. Dasaradha K.',
        specialty: 'Chief Medical Officer & General Surgeon',
        department: 'Outpatient (OPD)',
        phone: '+91 9441234567',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_JENKINS',
        name: 'Dr. Sarah Jenkins',
        specialty: 'Senior Interventional Cardiologist',
        department: 'Cardiology',
        phone: '+91 9887654321',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_NAIR',
        name: 'Dr. Rajiv Nair',
        specialty: 'Consultant General Physician',
        department: 'Inpatient (IPD)',
        phone: '+91 9553216540',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_HELEN',
        name: 'Dr. Helen Carter',
        specialty: 'Emergency Medicine Specialist',
        department: 'Emergency',
        phone: '+91 8121345678',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_RIVERA',
        name: 'Dr. Alex Rivera',
        specialty: 'Radiology Ultrasound Head',
        department: 'Radiology',
        phone: '+91 9223344556',
        status: 'On Leave',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_THOMAS',
        name: 'Pharmacist Thomas K.',
        specialty: 'Lead Compounding Pharmacist & Store Head',
        department: 'Pharmacy',
        phone: '+91 9334455667',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      },
      {
        doctorId: 'DOC_PRIYA',
        name: 'Priya Sharma (Dispenser)',
        specialty: 'Primary Pharmacy Billing & Drug Dispenser',
        department: 'Pharmacy',
        phone: '+91 9112233445',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      }
    ];

    try {
      for (const d of presetDoctorsList) {
        await setDoc(doc(db, 'doctors', d.doctorId), d);
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error("Failed to seed doctors directory:", err);
      setErrorText("Action Denied: You do not have permissions to register doctors.");
      handleFirestoreError(err, OperationType.WRITE, 'doctors');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !doctorName.trim() || !specialty.trim() || !phone.trim()) return;

    setSubmitLoading(true);
    setErrorText(null);

    const generatedId = 'DOC_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const newDoc: Doctor = {
      doctorId: generatedId,
      name: doctorName.trim(),
      specialty: specialty.trim(),
      department,
      phone: phone.trim(),
      status,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid
    };

    try {
      await setDoc(doc(db, 'doctors', generatedId), newDoc);
      // Reset form states
      setDoctorName('');
      setSpecialty('');
      setPhone('');
      setStatus('Active');
      setIsFormOpen(false);
    } catch (err) {
      console.error("Failed to add doctor record:", err);
      setErrorText("Database Write Blocked. Check safety rules compliance.");
      handleFirestoreError(err, OperationType.WRITE, `doctors/${generatedId}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (doctor: Doctor) => {
    if (!auth.currentUser) return;
    try {
      const nextStatus = doctor.status === 'Active' ? 'On Leave' : 'Active';
      const updated = {
        ...doctor,
        status: nextStatus
      };
      await setDoc(doc(db, 'doctors', doctor.doctorId), updated);
    } catch (err) {
      console.error("Failed to toggle status:", err);
      setErrorText("Permission Denied: Unauthorized configuration update.");
      handleFirestoreError(err, OperationType.WRITE, `doctors/${doctor.doctorId}`);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    if (!auth.currentUser) return;
    if (!window.confirm("Are you sure you want to remove this medical staff entry?")) return;

    try {
      await deleteDoc(doc(db, 'doctors', doctorId));
    } catch (err) {
      console.error("Failed to delete doctor:", err);
      setErrorText("Permission Denied: Insufficient authorization to delete profile registry.");
      handleFirestoreError(err, OperationType.DELETE, `doctors/${doctorId}`);
    }
  };

  // Filter application on list
  const filteredDoctors = doctors.filter(docObj => {
    const matchesSearch = docObj.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          docObj.specialty.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === 'All' || docObj.department === selectedDept;
    const matchesStatus = selectedStatus === 'All' || docObj.status === selectedStatus;
    return matchesSearch && matchesDept && matchesStatus;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6" id="doctors-manager-root">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-800 uppercase flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">🩺</span>
            Doctors & Pharmacy Staff Directory
          </h2>
          <p className="text-xs text-slate-400 font-mono font-bold uppercase tracking-wider mt-1">
            Registered Practitioners, Physicians, and Pharmacists Duty Register
          </p>
        </div>

        <div className="flex items-center gap-3">
          {doctors.length === 0 && (
            <button
              onClick={handleSeedDoctors}
              disabled={submitLoading}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-mono font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-40"
            >
              <Database size={13} />
              Pre-populate Duty Register
            </button>
          )}

          <button
            onClick={() => setIsFormOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <Plus size={13} />
            Register Doctor & Staff
          </button>
        </div>
      </div>

      {errorText && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-xs font-mono flex items-start gap-2.5">
          <XOctagon size={15} className="shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Name or Specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs outline-none focus:border-blue-400 transition-all font-sans"
          />
        </div>

        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-blue-400 transition-all font-mono font-bold text-slate-600 appearance-none"
          >
            <option value="All">🏥 All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>📂 {d}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-blue-400 transition-all font-mono font-bold text-slate-600 appearance-none"
          >
            <option value="All">🚦 All Statuses</option>
            <option value="Active">🟢 Active / On Duty</option>
            <option value="On Leave">🟡 On Leave</option>
          </select>
        </div>

        <div className="flex items-center justify-end">
          <span className="text-[10px] font-mono font-black uppercase text-slate-400 tracking-wider">
            Total Matched: <span className="text-slate-800 font-extrabold">{filteredDoctors.length}</span>
          </span>
        </div>
      </div>

      {/* Grid rendering list */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Syncing Duty Roster Profiles...</p>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <div className="p-3 bg-slate-50 w-fit mx-auto rounded-full mb-3 text-slate-400">
            <Users size={24} />
          </div>
          <h3 className="text-xs font-mono font-bold text-slate-600 uppercase tracking-widest">No Medical Staff Profiles Matched</h3>
          <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto font-sans leading-relaxed">
            Please register staff personnel using the button above or clear active search queries.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDoctors.map(doctor => (
            <div 
              key={doctor.doctorId} 
              className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between ${doctor.status === 'On Leave' ? 'border-amber-100 bg-amber-50/10' : 'border-slate-200'}`}
            >
              {/* Status Ribbon top corner */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <button
                  onClick={() => handleToggleStatus(doctor)}
                  title="Click to toggle active duty status"
                  className={`px-2 py-1 rounded-full text-[9px] font-mono font-black uppercase tracking-wider transition-all select-none border flex items-center gap-1 ${doctor.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${doctor.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  {doctor.status}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 mt-1.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-600 shrink-0">
                    <Stethoscope size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800">{doctor.name}</h4>
                    <p className="text-[11px] text-slate-400 font-medium font-mono leading-tight mt-0.5">{doctor.specialty}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-500 font-sans">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 w-24">Department</span>
                    <span className="font-semibold text-slate-700">{doctor.department}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 w-24">Contact Phone</span>
                    <span className="font-mono text-slate-700 flex items-center gap-1 font-bold">
                      <Phone size={10} className="text-slate-400" />
                      {doctor.phone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 w-24">Identity ID</span>
                    <span className="font-mono text-[10px] text-slate-800 font-extrabold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{doctor.doctorId}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[9px] text-slate-400 font-mono">Date added: {new Date(doctor.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => handleDeleteDoctor(doctor.doctorId)}
                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-lg transition-colors"
                  title="Remove Staff Member"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register dialog modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🩺</span>
                  <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Register Doctors & Hospital Staff</h3>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleAddDoctor} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Doctor / Staff Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Helen Carter"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Specialty / Role Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Consultant Cardiologist / Head Pharmacist"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-sans"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Assigned Department</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-mono font-bold text-slate-600"
                    >
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Contact Phone Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. +91 9441234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-blue-400 focus:bg-white transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Duty Status</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={status === 'Active'}
                        onChange={() => setStatus('Active')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Active / On Duty</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={status === 'On Leave'}
                        onChange={() => setStatus('On Leave')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      <span>On Leave</span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleSeedDoctors}
                    disabled={submitLoading}
                    className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-mono font-bold transition-all disabled:opacity-40"
                  >
                    🚀 Auto-Seed Presets
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-mono font-bold rounded-xl transition-all"
                    >
                      Nevermind
                    </button>
                    <button
                      type="submit"
                      disabled={submitLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-sm disabled:opacity-40"
                    >
                      {submitLoading ? 'Registering...' : 'Add Active Profile'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
