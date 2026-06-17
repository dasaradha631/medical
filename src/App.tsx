import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { 
  StaffProfile, 
  InwardInvoice, 
  OutwardInvoice, 
  DecryptedOutwardInvoice, 
  InvoiceItem,
  Medicine,
  Doctor,
  DecryptedPrescription
} from './types';
import { GSTTaxTally } from './components/GSTTaxTally';
import { ReportViewer } from './components/ReportViewer';
import { InvoicesManager } from './components/InvoicesManager';
import { MedicinesManager } from './components/MedicinesManager';
import { DoctorsManager } from './components/DoctorsManager';
import { PrescriptionsManager } from './components/PrescriptionsManager';
import { ConsultancyManager } from './components/ConsultancyManager';
import { BillPrinter } from './components/BillPrinter';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogOut, 
  Activity, 
  ShieldCheck, 
  Users, 
  Layers, 
  UserPlus, 
  Lock, 
  Sparkles,
  ClipboardList
} from 'lucide-react';

// Required error handling interfaces for Firestore compliance
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [viewState, setViewState] = useState<'dashboard' | 'billing' | 'prescriptions' | 'audit' | 'medicines' | 'bill-printer' | 'doctors' | 'consultancy'>('dashboard');
  const [activePrintId, setActivePrintId] = useState<string>('');
  const [draftPrescription, setDraftPrescription] = useState<DecryptedPrescription | null>(null);
  const [activeConsultation, setActiveConsultation] = useState<{
    patientName: string;
    patientId: string;
    patientContact: string;
    doctorId: string;
    doctorName: string;
    department: string;
    consultationId: string;
  } | null>(null);

  // Database lists
  const [rawOutwardInvoices, setRawOutwardInvoices] = useState<OutwardInvoice[]>([]);
  const [decryptedOutwardInvoices, setDecryptedOutwardInvoices] = useState<DecryptedOutwardInvoice[]>([]);
  const [inwardInvoices, setInwardInvoices] = useState<InwardInvoice[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Onboarding staff registration States
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [onboardName, setOnboardName] = useState<string>('');
  const [onboardRole, setOnboardRole] = useState<'Billing Clerk' | 'Pharmacist' | 'Admin' | 'CFO'>('Billing Clerk');
  const [onboardDept, setOnboardDept] = useState<string>('Outpatient (OPD)');

  const DEPARTMENTS = [
    'Outpatient (OPD)',
    'Inpatient (IPD)',
    'Pharmacy',
    'Cardiology',
    'Radiology',
    'Emergency'
  ];

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch staff profile parameters
        try {
          const profileDoc = await getDoc(doc(db, 'staff_roles', currentUser.uid));
          if (profileDoc.exists()) {
            setStaffProfile(profileDoc.data() as StaffProfile);
            setShowOnboarding(false);
          } else {
            // Unregistered user - redirect to onboarding panel
            setOnboardName(currentUser.displayName || '');
            setShowOnboarding(true);
          }
        } catch (err) {
          console.error("Error retrieving user credentials profiles:", err);
          handleFirestoreError(err, OperationType.GET, `staff_roles/${currentUser.uid}`);
        }
      } else {
        setStaffProfile(null);
        setViewState('dashboard');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync real-time documents from Firestore
  useEffect(() => {
    if (!user || !staffProfile) return;

    // Listen to Inward Invoices
    const unsubInward = onSnapshot(collection(db, 'inward_invoices'), (snapshot) => {
      const invoices: InwardInvoice[] = [];
      snapshot.forEach(doc => {
        invoices.push(doc.data() as InwardInvoice);
      });
      setInwardInvoices(invoices);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inward_invoices');
    });

    // Listen to Outward Invoices
    const unsubOutward = onSnapshot(collection(db, 'outward_invoices'), (snapshot) => {
      const invoices: OutwardInvoice[] = [];
      snapshot.forEach(doc => {
        invoices.push(doc.data() as OutwardInvoice);
      });
      setRawOutwardInvoices(invoices);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'outward_invoices');
    });

    // Listen to Medicines Stock
    const unsubMedicines = onSnapshot(collection(db, 'medicines'), (snapshot) => {
      const list: Medicine[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Medicine);
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMedicines(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'medicines');
    });

    // Listen to Doctors Directory
    const unsubDoctors = onSnapshot(collection(db, 'doctors'), (snapshot) => {
      const list: Doctor[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Doctor);
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setDoctors(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'doctors');
    });

    return () => {
      unsubInward();
      unsubOutward();
      unsubMedicines();
      unsubDoctors();
    };
  }, [user, staffProfile]);

  // Bulk Decrypt patient bills when raw collection changes on client side
  useEffect(() => {
    const decryptAllList = async () => {
      if (rawOutwardInvoices.length === 0) {
        setDecryptedOutwardInvoices([]);
        return;
      }

      try {
        const response = await fetch('/api/patient/decrypt-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoices: rawOutwardInvoices })
        });

        if (response.ok) {
          const data = await response.json();
          setDecryptedOutwardInvoices(data.decryptedInvoices);
        } else {
          console.error("Server encryption engine returned an unexpected status.");
        }
      } catch (err) {
        console.error("Failed to decrypt clinical patient records stream:", err);
      }
    };

    decryptAllList();
  }, [rawOutwardInvoices]);

  // Login handler
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Auth Exception during Single Sign-On:", err);
      setAuthError(err.message || 'SSO Authorization failed or was canceled.');
    }
  };

  const handleDemoLogin = async (email: string, name: string, role: 'Billing Clerk' | 'Pharmacist' | 'Admin' | 'CFO', department: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, 'demoPassword123');
      } catch (signInErr: any) {
        // If user doesn't exist or other error, register them
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/invalid-email' || signInErr.code === 'auth/user-disabled') {
          userCredential = await createUserWithEmailAndPassword(auth, email, 'demoPassword123');
        } else {
          throw signInErr;
        }
      }

      const u = userCredential.user;
      
      // Immediately verify the user role profile document
      const profileDoc = await getDoc(doc(db, 'staff_roles', u.uid));
      let currentProfile: StaffProfile;
      if (!profileDoc.exists()) {
        currentProfile = {
          uid: u.uid,
          email: u.email || '',
          name: name,
          role: role,
          department: department,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'staff_roles', u.uid), currentProfile);
      } else {
        currentProfile = profileDoc.data() as StaffProfile;
      }
      setStaffProfile(currentProfile);
      setShowOnboarding(false);
    } catch (err: any) {
      console.error("Demo login bypass setup error:", err);
      setAuthError(err.message || 'Verification Error during Demo Session Initialization');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout fail:", err);
    }
  };

  // Profile onboarding registration
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Strict constraint: Admin status bootstrapped for designated client developer
    const roleToAssign = user.email === 'dasaradha65656@gmail.com' || user.email === 'dasaradha656@gmail.com' ? 'Admin' : onboardRole;

    const profile: StaffProfile = {
      uid: user.uid,
      email: user.email || '',
      name: onboardName,
      role: roleToAssign,
      department: onboardDept,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'staff_roles', user.uid), profile);
      setStaffProfile(profile);
      setShowOnboarding(false);
    } catch (err) {
      console.error("Staff profiles registration failed on firestore writes:", err);
      handleFirestoreError(err, OperationType.WRITE, `staff_roles/${user.uid}`);
    }
  };

  // Register New Outward patient invoice
  const handleAddOutwardInvoice = async (invoiceData: {
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
  }) => {
    if (!user) return;

    try {
      // 1. Ask Express server to securely encrypt the clinical parameters
      const crypResponse = await fetch('/api/patient/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: invoiceData.patientName,
          patientId: invoiceData.patientId,
          contact: invoiceData.patientContact,
          treatment: invoiceData.treatmentDescription
        })
      });

      if (!crypResponse.ok) throw new Error("Cryp encryption server component failed");
      const cipherData = await crypResponse.json();

      const newId = invoiceData.invoiceId || ('OUT_' + Math.random().toString(36).substring(2, 9).toUpperCase());

      // 2. Commit encrypted patient fields and ledger balances to Firestore
      const outwardRecord: OutwardInvoice = {
        invoiceId: newId,
        patientNameEncrypted: cipherData.patientNameEncrypted,
        patientIdEncrypted: cipherData.patientIdEncrypted,
        patientContactEncrypted: cipherData.patientContactEncrypted,
        treatmentDescriptionEncrypted: cipherData.treatmentDescriptionEncrypted,
        department: invoiceData.department,
        items: invoiceData.items,
        subTotal: invoiceData.subTotal,
        gstTotal: invoiceData.gstTotal,
        grandTotal: invoiceData.grandTotal,
        paymentMode: invoiceData.paymentMode,
        paymentStatus: 'Received',
        invoiceDate: invoiceData.invoiceDate,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        doctorId: invoiceData.doctorId || '',
        doctorName: invoiceData.doctorName || ''
      };

      await setDoc(doc(db, 'outward_invoices', newId), outwardRecord);

      // 3. Keep Medicines Inventory stock up-to-date by subtracting items sold
      for (const item of invoiceData.items) {
        let targetMedDoc: any = null;
        let targetMedId = '';

        // Clean the item description for matching
        let cleanQueryName = item.description.toLowerCase().trim();
        if (cleanQueryName.includes('] ')) {
          cleanQueryName = cleanQueryName.split('] ')[1].trim();
        }

        try {
          // Perform an exhaustive look-up of medicines from Firestore directly to protect against any offline lag or client state deviations
          const medsSnapshot = await getDocs(collection(db, 'medicines'));
          const allMeds = medsSnapshot.docs.map(docObj => ({
            id: docObj.id,
            data: docObj.data() as Medicine
          }));

          // Pass 1: Try exact ID or exact Name matching
          for (const itemObj of allMeds) {
            const medData = itemObj.data;
            const medId = itemObj.id;
            const normMedName = medData.name.toLowerCase().trim();

            const matchesId = item.id === medId || (item.id && item.id.startsWith('MED_') && item.id === medData.medicineId);
            const matchesExactName = normMedName === cleanQueryName || cleanQueryName === normMedName;

            if (matchesId || matchesExactName) {
              targetMedDoc = medData;
              targetMedId = medId;
              break;
            }
          }

          // Pass 2: Secondary fuzzy matches (if Pass 1 didn't find anything)
          if (!targetMedDoc) {
            for (const itemObj of allMeds) {
              const medData = itemObj.data;
              const medId = itemObj.id;
              const normMedName = medData.name.toLowerCase().trim();
              const normMedCode = medData.code ? medData.code.toLowerCase().trim() : '';

              const matchesSubstring = cleanQueryName.includes(normMedName) || normMedName.includes(cleanQueryName);
              const matchesCode = normMedCode && (cleanQueryName.includes(normMedCode) || normMedCode === cleanQueryName || item.description.toLowerCase().includes(normMedCode));

              if (matchesSubstring || matchesCode) {
                targetMedDoc = medData;
                targetMedId = medId;
                break;
              }
            }
          }
        } catch (err) {
          console.error(`Error querying master medicines database in-bill search for item "${item.description}":`, err);
        }

        // Apply Stock depletion once target is successfully identified
        if (targetMedDoc && targetMedId) {
          const qtyToSubtract = Number(item.quantity) || 0;
          const currentStock = Number(targetMedDoc.stock) || 0;
          const newStock = Math.max(0, currentStock - qtyToSubtract);
          const medDocRef = doc(db, 'medicines', targetMedId);

          try {
            await setDoc(medDocRef, {
              ...targetMedDoc,
              stock: newStock,
              updatedAt: new Date().toISOString(),
              updatedBy: user.uid
            });
            console.log(`Inventory updated: ${targetMedDoc.name} stock changed from ${currentStock} to ${newStock}`);
          } catch (writeErr) {
            console.error(`Failed to update stock in Firestore for ${targetMedDoc.name} (${targetMedId}):`, writeErr);
            handleFirestoreError(writeErr, OperationType.WRITE, `medicines/${targetMedId}`);
          }
        } else {
          console.warn(`Dispensary warning: Stock reduction skipped because no registered Medicine matched item:`, item);
        }
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'outward_invoices');
    }
  };

  // Register New inward procurement supply bills
  const handleAddInwardInvoice = async (invoiceData: {
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
  }) => {
    if (!user) return;

    try {
      const newId = invoiceData.invoiceId || ('IN_' + Math.random().toString(36).substring(2, 9).toUpperCase());

      const inwardRecord: InwardInvoice = {
        invoiceId: newId,
        vendorName: invoiceData.vendorName,
        vendorGstin: invoiceData.vendorGstin,
        department: invoiceData.department,
        items: invoiceData.items,
        subTotal: invoiceData.subTotal,
        gstTotal: invoiceData.gstTotal,
        grandTotal: invoiceData.grandTotal,
        paymentMode: invoiceData.paymentMode,
        paymentStatus: invoiceData.paymentStatus,
        invoiceDate: invoiceData.invoiceDate,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      };

      await setDoc(doc(db, 'inward_invoices', newId), inwardRecord);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'inward_invoices');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center font-mono">
        <Activity className="animate-pulse text-blue-600 mb-4" size={32} />
        <span className="text-xs text-slate-500 font-semibold tracking-wide">Connecting to Medi-Cloud SecGate...</span>
      </div>
    );
  }

  // --- VIEW: LOGGED OUT LOGIN PROMPT ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col justify-center items-center px-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative overflow-hidden"
          id="login-card-container"
        >
          <div className="absolute top-0 right-0 p-3 bg-emerald-50 text-emerald-700 border-l border-b border-emerald-100 text-[9px] uppercase tracking-widest font-mono font-bold rounded-bl-xl">
            ● AES-256 SECURE
          </div>

          <div className="text-center mt-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">MEDICORE <span className="text-blue-600 italic">ERP</span></h1>
            <p className="text-xs text-slate-500 mt-2.5 max-w-sm mx-auto leading-relaxed font-medium">
              Medical financial records & hospital billing platform equipped with AES-256 Patient Cryptography and GST tally engines.
            </p>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                id="google-login-btn"
              >
                <Users size={16} /> Sign In with Hospital Account
              </button>
              <p className="text-[10px] text-center text-slate-400 mt-2">
                Requires standard popup browser authorization.
              </p>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">OR INSTANT IFRAME ACCESS</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {authError && (
              <div className="bg-rose-50 border border-rose-150 rounded-xl p-3 text-rose-800 text-[11px] font-medium leading-relaxed">
                {authError}
              </div>
            )}

            <div className="space-y-2.5">
              <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider text-center">Select Role to Bypass Auth & Setup Workspace:</p>
              
              <button
                onClick={() => handleDemoLogin('admin@example.com', 'Dr. Dasaradha (Admin/Dev)', 'Admin', 'Emergency')}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">👑</span>
                  <div className="text-left">
                    <p className="font-bold text-slate-700">Dr. Dasaradha (Developer)</p>
                    <p className="text-[9px] text-slate-400 font-mono">admin@example.com</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full uppercase">Admin Bypass</span>
              </button>

              <button
                onClick={() => handleDemoLogin('cfo@example.com', 'Finance Director', 'CFO', 'Pharmacy')}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📈</span>
                  <div className="text-left">
                    <p className="font-bold text-slate-700">Finance Director</p>
                    <p className="text-[9px] text-slate-400 font-mono">cfo@example.com</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full uppercase">CFO Bypass</span>
              </button>

              <button
                onClick={() => handleDemoLogin('pharmacist@example.com', 'Dispensary Manager', 'Pharmacist', 'Pharmacy')}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">💊</span>
                  <div className="text-left">
                    <p className="font-bold text-slate-700">Dispensary Manager</p>
                    <p className="text-[9px] text-slate-400 font-mono">pharmacist@example.com</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded-full uppercase">Pharmacist Bypass</span>
              </button>

              <button
                onClick={() => handleDemoLogin('clerk@example.com', 'Duty Billing Clerk', 'Billing Clerk', 'Outpatient (OPD)')}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs transition-colors"
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📝</span>
                  <div className="text-left">
                    <p className="font-bold text-slate-700">Duty Billing Clerk</p>
                    <p className="text-[9px] text-slate-400 font-mono">clerk@example.com</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full uppercase">Clerk Bypass</span>
              </button>
            </div>

            <div className="flex items-center gap-2 justify-center text-[10px] text-slate-400 font-mono pt-2">
              <Lock size={12} className="text-slate-400" /> Secure Sandbox Bypass Controller
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- VIEW: REGISTRATION ONBOARDING FLOW ---
  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col justify-center items-center px-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm"
          id="onboarding-panel"
        >
          <div className="text-center mb-6">
            <UserPlus size={28} className="text-blue-600 mx-auto mb-2" />
            <h2 className="text-base font-bold uppercase tracking-wide text-slate-850">Staff Credentials Onboarding</h2>
            <p className="text-xs text-slate-500 mt-1">Configure your active role assignment before launching the MedLedger dashboard workspace.</p>
          </div>

          <form onSubmit={handleOnboardSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Authenticated Email</label>
              <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-lg text-xs text-slate-600 font-mono">
                {user.email}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Clinician Name</label>
              <input
                type="text"
                required
                value={onboardName}
                onChange={(e) => setOnboardName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Operational Role</label>
                <select
                  value={onboardRole}
                  onChange={(e) => setOnboardRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 outline-none focus:border-blue-400 font-mono"
                >
                  <option value="Billing Clerk">Billing Clerk</option>
                  <option value="Pharmacist">Pharmacist</option>
                  <option value="CFO">Chief Financial Officer</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1 font-bold">Department</label>
                <select
                  value={onboardDept}
                  onChange={(e) => setOnboardDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 outline-none focus:border-blue-400 font-mono"
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
            >
              Initialize Workspace Access
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // --- VIEW: MAIN WORKSPACE INTERFACES ---
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col selection:bg-blue-100 selection:text-blue-800">
      {/* Header Shell Row */}
      <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between shadow-sm shrink-0 print:hidden" id="main-hospital-header">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-800 uppercase">MEDICORE<span className="text-blue-600 italic">ENTERPRISE</span></h1>
            <p className="text-[9px] text-slate-400 font-mono font-bold tracking-wider">SECURE CERTIFIED TALLY ERP</p>
          </div>
        </div>

        {/* Dynamic Navigation Toolbar with Bento tabs */}
        <div className="flex items-center gap-2 print:hidden" id="nav-actions-header">
          <button
            onClick={() => setViewState('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'dashboard' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            📊 Financial Tally
          </button>
          <button
            onClick={() => setViewState('consultancy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'consultancy' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            📋 Consultancy Desk
          </button>
          <button
            onClick={() => setViewState('prescriptions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'prescriptions' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            ✍️ Prescriptions
          </button>
          <button
            onClick={() => setViewState('billing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'billing' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            🧾 Medicine Billing
          </button>
          <button
            onClick={() => setViewState('medicines')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'medicines' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            💊 Medicines
          </button>
          <button
            onClick={() => setViewState('doctors')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'doctors' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            🩺 Doctors & Staff
          </button>
          <button
            onClick={() => { setActivePrintId(''); setViewState('bill-printer'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'bill-printer' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            🖨️ Bill Lookup & Print
          </button>
          <button
            onClick={() => setViewState('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition-colors ${viewState === 'audit' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}
          >
            ✨ AI Audits
          </button>
        </div>

        {/* User profile and signout segment */}
        <div className="flex items-center gap-3" id="header-user-profile">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 hidden md:flex">
            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider">AES-256</span>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-slate-700">{staffProfile?.name}</p>
            <span className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">
              {staffProfile?.role}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-rose-600 border border-slate-205 rounded-lg transition-colors shadow-sm"
            title="Log Out Staff Console"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 print:p-0 print:bg-white print:max-w-none print:w-auto">
        {/* Dynamic Page Views */}
        <AnimatePresence mode="wait">
          {viewState === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <GSTTaxTally 
                outwardInvoices={decryptedOutwardInvoices} 
                inwardInvoices={inwardInvoices} 
                departments={DEPARTMENTS} 
              />
            </motion.div>
          )}

          {viewState === 'consultancy' && (
            <motion.div
              key="consultancy"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <ConsultancyManager
                staffProfile={staffProfile}
                doctors={doctors}
                onAddOutward={handleAddOutwardInvoice}
                onSendToDoctor={(p) => {
                  setActiveConsultation(p);
                  setViewState('prescriptions');
                }}
              />
            </motion.div>
          )}

          {viewState === 'prescriptions' && (
            <motion.div
              key="prescriptions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <PrescriptionsManager
                staffProfile={staffProfile}
                doctors={doctors}
                activeConsultation={activeConsultation}
                onClearActiveConsultation={() => setActiveConsultation(null)}
                onDraftBillFromPrescription={(pres) => {
                  setDraftPrescription(pres);
                  setViewState('billing');
                }}
              />
            </motion.div>
          )}

          {viewState === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <InvoicesManager
                staffProfile={staffProfile}
                outwardInvoices={decryptedOutwardInvoices}
                inwardInvoices={inwardInvoices}
                departments={DEPARTMENTS}
                medicines={medicines}
                doctors={doctors}
                draftPrescription={draftPrescription}
                onClearDraftPrescription={() => setDraftPrescription(null)}
                onAddOutward={handleAddOutwardInvoice}
                onAddInward={handleAddInwardInvoice}
                onNavigateToPrint={(id) => { setActivePrintId(id); setViewState('bill-printer'); }}
              />
            </motion.div>
          )}

          {viewState === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <ReportViewer
                outwardInvoices={decryptedOutwardInvoices}
                inwardInvoices={inwardInvoices}
                departments={DEPARTMENTS}
              />
            </motion.div>
          )}

          {viewState === 'medicines' && (
            <motion.div
              key="medicines"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <MedicinesManager staffProfile={staffProfile} />
            </motion.div>
          )}

          {viewState === 'doctors' && (
            <motion.div
              key="doctors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <DoctorsManager staffProfile={staffProfile} doctors={doctors} />
            </motion.div>
          )}

          {viewState === 'bill-printer' && (
            <motion.div
              key="bill-printer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <BillPrinter
                staffProfile={staffProfile}
                outwardInvoices={decryptedOutwardInvoices}
                inwardInvoices={inwardInvoices}
                initialSelectedInvoiceId={activePrintId}
                onSelectInvoiceId={(id) => setActivePrintId(id)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Core Security Compliance footer matching Bento theme */}
      <footer className="bg-white border-t border-slate-200 h-11 px-8 flex items-center justify-between shrink-0 text-[10px] text-slate-500 font-mono print:hidden">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ACCESS AUDIT STATE:</span>
          <span>[SECURE LOG] Staff session verified successfully. SSL-DB tunnel active.</span>
        </div>
        <div className="flex items-center gap-2 text-blue-600 font-bold">
          <div className="w-2 h-2 bg-blue-600 rounded-sm"></div>
          <span className="text-[10px] uppercase italic">Medi-Cloud v4.2.0.1</span>
        </div>
      </footer>
    </div>
  );
}
