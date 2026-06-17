import React, { useState, useEffect } from 'react';
import { DecryptedOutwardInvoice, InwardInvoice, StaffProfile } from '../types';
import { Search, Printer, CheckCircle, AlertTriangle, ArrowLeft, FileText, Calendar, Building2, User, Coins, ShieldCheck, HeartPulse } from 'lucide-react';

interface BillPrinterProps {
  staffProfile: StaffProfile | null;
  outwardInvoices: DecryptedOutwardInvoice[];
  inwardInvoices: InwardInvoice[];
  initialSelectedInvoiceId?: string;
  onSelectInvoiceId?: (id: string) => void;
}

export const BillPrinter: React.FC<BillPrinterProps> = ({
  staffProfile,
  outwardInvoices,
  inwardInvoices,
  initialSelectedInvoiceId = '',
  onSelectInvoiceId,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(initialSelectedInvoiceId);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'outward' | 'inward' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Handle outside loaded initial state
  useEffect(() => {
    if (initialSelectedInvoiceId) {
      setSelectedInvoiceId(initialSelectedInvoiceId);
      const isOutward = outwardInvoices.some(inv => inv.invoiceId === initialSelectedInvoiceId);
      const isInward = inwardInvoices.some(inv => inv.invoiceId === initialSelectedInvoiceId);
      if (isOutward) {
        setSelectedInvoiceType('outward');
      } else if (isInward) {
        setSelectedInvoiceType('inward');
      }
    }
  }, [initialSelectedInvoiceId, outwardInvoices, inwardInvoices]);

  // Handle invoice searching
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    // Search outward
    const foundOutward = outwardInvoices.find(
      inv => inv.invoiceId.toUpperCase() === query || 
             (inv.patientId && inv.patientId.toUpperCase() === query) ||
             (inv.patientName && inv.patientName.toUpperCase().includes(query))
    );

    if (foundOutward) {
      setSelectedInvoiceId(foundOutward.invoiceId);
      setSelectedInvoiceType('outward');
      if (onSelectInvoiceId) onSelectInvoiceId(foundOutward.invoiceId);
      return;
    }

    // Search inward
    const foundInward = inwardInvoices.find(
      inv => inv.invoiceId.toUpperCase() === query ||
             inv.vendorName.toUpperCase().includes(query)
    );

    if (foundInward) {
      setSelectedInvoiceId(foundInward.invoiceId);
      setSelectedInvoiceType('inward');
      if (onSelectInvoiceId) onSelectInvoiceId(foundInward.invoiceId);
      return;
    }

    setErrorMessage(`No recorded invoice matches "${query}". Please check the medical/invoice number and try again.`);
  };

  const handleSelectInvoice = (id: string, type: 'outward' | 'inward') => {
    setSelectedInvoiceId(id);
    setSelectedInvoiceType(type);
    setSearchQuery('');
    setErrorMessage('');
    if (onSelectInvoiceId) onSelectInvoiceId(id);
  };

  const handlePrint = () => {
    window.print();
  };

  // Find the selected invoice profile details
  const currentOutward = selectedInvoiceType === 'outward' 
    ? outwardInvoices.find(inv => inv.invoiceId === selectedInvoiceId) 
    : null;

  const currentInward = selectedInvoiceType === 'inward' 
    ? inwardInvoices.find(inv => inv.invoiceId === selectedInvoiceId) 
    : null;

  // Render lists of recent invoices for easy clicking
  const allInvoices = [
    ...outwardInvoices.map(inv => ({ 
      id: inv.invoiceId, 
      label: `${inv.invoiceId} — ${inv.patientName} (${inv.department})`, 
      type: 'outward' as const,
      date: inv.invoiceDate,
      total: inv.grandTotal
    })),
    ...inwardInvoices.map(inv => ({ 
      id: inv.invoiceId, 
      label: `${inv.invoiceId} — Vendor: ${inv.vendorName} (${inv.department})`, 
      type: 'inward' as const,
      date: inv.invoiceDate,
      total: inv.grandTotal
    }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {/* Search and Checker Row - hidden in native CSS printing */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm print:hidden animate-fade-in" id="bill-printer-controls">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-mono font-black uppercase tracking-tight text-blue-600 flex items-center gap-1.5">
              <Printer size={16} /> Bill Lookup, Invoice Verifier & Printer
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
              Enter any medical receipt reference, patient name, patient MRN, or search inward expense records to preview and take A4 paper printouts.
            </p>
          </div>
          {selectedInvoiceId && (
            <button
              onClick={() => {
                setSelectedInvoiceId('');
                setSelectedInvoiceType(null);
                setSearchQuery('');
                if (onSelectInvoiceId) onSelectInvoiceId('');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-350 text-slate-600 hover:text-slate-900 rounded-xl text-[10px] font-mono font-bold transition-all shadow-sm w-fit"
            >
              <ArrowLeft size={12} /> Search Mode
            </button>
          )}
        </div>

        {!selectedInvoiceId ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    placeholder="Search by Invoice Number (e.g. OUT_A1B2), Patient Name, or Patient ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 focus:bg-white transition-all font-sans font-semibold text-slate-800 shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Search size={14} /> Check Invoice
                </button>
              </form>

              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-150 text-rose-800 text-[11px] font-medium leading-relaxed rounded-xl flex items-start gap-2.5">
                  <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Guide card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  <ShieldCheck size={12} className="text-emerald-500" /> Compliance Checker Audit Logs
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  All printed receipts strictly enforce the Central/State tax splits (<span className="font-mono font-bold">CGST & SGST</span>), category HSN classifications, and patient-data encryption audits required under clinical privacy controls.
                </p>
              </div>
            </div>

            {/* Quick-Access recent list */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col h-[230px]">
              <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest block mb-2">📜 RECENT LEDGER INVOICES</span>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {allInvoices.length > 0 ? (
                  allInvoices.map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv.id, inv.type)}
                      className="w-full text-left p-2 bg-white hover:bg-slate-100 border border-slate-150 rounded-lg text-[11px] font-medium text-slate-800 flex justify-between items-center transition-all shadow-sm group"
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono font-bold text-blue-600 block group-hover:text-blue-700">{inv.id}</span>
                        <span className="text-slate-500 text-[10px] block truncate">{inv.label.split(' — ')[1] || inv.label}</span>
                      </div>
                      <span className={`shrink-0 font-mono font-bold text-[10px] p-1 px-1.5 rounded-md ${inv.type === 'outward' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                        ₹{inv.total.toLocaleString('en-IN')}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-400 font-mono text-center pt-12">No invoices recorded yet in this workspace.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-3.5 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle className="text-emerald-600 shrink-0" size={16} />
              <div className="font-mono">
                <span className="text-slate-500 font-semibold">Active Document: </span>
                <span className="font-black text-slate-800">{selectedInvoiceId}</span>
                <span className="text-slate-400 ml-1.5 uppercase font-bold text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                  {selectedInvoiceType === 'outward' ? 'Patient Outward' : 'Procurement Inward'}
                </span>
              </div>
            </div>
            
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Printer size={15} /> Take Printout (A4 Paper Print)
            </button>
          </div>
        )}
      </div>

      {/* RENDER ACTIVE PRINT PREVIEW BOX */}
      {selectedInvoiceId && (
        <div className="bg-slate-100 flex justify-center py-6 px-1 md:px-6 rounded-2xl border border-slate-200 relative overflow-hidden print:-m-6 print:border-0 print:p-0 print:bg-white" id="invoice-workspace-sheet">
          {/* A4 sheet simulation Container */}
          <div className="bg-white w-[100%] max-w-[800px] border border-slate-300 print:border-0 rounded-2xl print:rounded-none shadow-md print:shadow-none p-6 md:p-12 font-sans text-slate-800 scale-in-animation relative" id="invoice-sheet-container">
            
            {/* Stamp watermark for secure audit logs */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none select-none border-8 border-emerald-600 text-emerald-600 text-5xl md:text-7xl font-mono font-black rounded-lg p-4 rotate-12 flex flex-col items-center justify-center">
              <span>SECURE VERIFIED</span>
              <span className="text-xl mt-2 font-bold uppercase">MediCore Enterprise ERP</span>
            </div>

            {/* CLINICAL OUTWARD (PATIENT) BILL RECEIPT RENDER */}
            {selectedInvoiceType === 'outward' && currentOutward && (
              <div className="space-y-8" id="outward-invoice-print-area">
                
                {/* Invoice Receipt Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black">
                      MC
                    </div>
                    <div>
                      <h1 className="text-md font-black tracking-tight text-slate-900 uppercase">MEDICORE ENTERPRISE</h1>
                      <p className="text-[9px] text-slate-500 font-mono tracking-wider font-bold">SECURE INTEGRATED CLINICAL SOLUTIONS</p>
                      <p className="text-[9px] text-slate-400 font-sans tracking-tight font-medium">GSTIN Reg No: 29MMERP9824C1Z5 | Pin: 500081</p>
                    </div>
                  </div>
                  <div className="text-right md:text-right font-mono">
                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-100 p-1 px-2.5 rounded-full block w-fit ml-auto mb-2">
                      TAX INVOICE RECEIPT
                    </span>
                    <p className="text-xs text-slate-500 font-semibold">Bill No: &nbsp;
                      <span className="text-slate-850 font-black text-xs">{currentOutward.invoiceId}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold">Tax Date: {currentOutward.invoiceDate}</p>
                  </div>
                </div>

                {/* Patient Case and Hospital Registration Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs font-mono">
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <User size={11} className="text-slate-500" /> Patient Medical Profile
                    </span>
                    <p className="font-sans text-sm font-bold text-slate-850 flex items-center gap-1.5">
                      <span>{currentOutward.patientName}</span>
                    </p>
                    <p className="text-slate-500">Record No (MRN): &nbsp;
                      <span className="text-slate-800 font-bold">{currentOutward.patientId}</span>
                    </p>
                    <p className="text-slate-500">Contact Number: &nbsp;
                      <span className="text-slate-800 font-bold">{currentOutward.patientContact || 'N/A'}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <HeartPulse size={11} className="text-slate-500" /> Care Administration
                    </span>
                    <p className="text-slate-500">Servicing Dept: &nbsp;
                      <span className="text-slate-800 font-bold uppercase">{currentOutward.department}</span>
                    </p>
                    {currentOutward.doctorName && (
                      <p className="text-slate-500">Attending Doctor: &nbsp;
                        <span className="text-blue-700 font-bold uppercase">{currentOutward.doctorName}</span>
                      </p>
                    )}
                    <p className="text-slate-500 font-sans text-[11px] leading-relaxed">
                      Assigned Parameters: &nbsp;
                      <span className="text-slate-700 font-medium italic block mt-0.5">"{currentOutward.treatmentDescription || 'General diagnosis & health screening checkup'}"</span>
                    </p>
                  </div>
                </div>

                {/* Patient billing detailed Itemized Ledger Receipts table */}
                <div className="space-y-3">
                  <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest block">
                    📦 INVOICE LEDGER LINE ARTICLES
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left" id="outward-items-table">
                      <thead className="bg-slate-50 text-[10px] font-mono font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">S.No</th>
                          <th className="px-4 py-3">Formulation / Medical description</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Rate (₹)</th>
                          <th className="px-4 py-3 text-right">GST Rate</th>
                          <th className="px-4 py-3 text-right">Tax Amt (₹)</th>
                          <th className="px-4 py-3 text-right">Net Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        {currentOutward.items.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-mono text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3 font-sans font-bold text-slate-800 max-w-[250px] truncate">{item.description}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium">{item.quantity}</td>
                            <td className="px-4 py-3 text-right font-mono">₹{item.unitPrice.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">{item.gstRate}%</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500">₹{item.gstAmount.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono font-black text-slate-900">₹{item.total.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GST breakout details and Grand Total Calculations with CGST, SGST breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-3 border-t border-slate-200">
                  <div className="md:col-span-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-[10px] font-mono space-y-2">
                    <span className="font-black text-slate-500 uppercase tracking-wide block border-b border-slate-200 pb-1.5 flex items-center justify-between">
                      <span>🏛️ GST DEVOLUTION SUMMARY</span>
                      <span className="text-[9px] uppercase tracking-normal bg-indigo-50 text-indigo-700 border border-indigo-100 p-0.5 px-1.5 rounded">CGST + SGST (50/50)</span>
                    </span>
                    <div className="space-y-1.5 text-slate-600">
                      <div className="flex justify-between font-medium">
                        <span>Central GST (CGST Component):</span>
                        <span className="text-slate-800 font-bold">₹{(currentOutward.gstTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>State GST (SGST Component):</span>
                        <span className="text-slate-800 font-bold">₹{(currentOutward.gstTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-dashed border-slate-200 pt-1.5">
                        <span>Total Tax Collected Ledger:</span>
                        <span className="text-indigo-700 font-black">₹{currentOutward.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-6 flex flex-col justify-center items-end text-right font-mono space-y-1">
                    <p className="text-xs text-slate-500 font-semibold">Total Tax-Excl Price: &nbsp;
                      <span className="text-slate-800 font-bold">₹{currentOutward.subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="text-xs text-indigo-700 font-extrabold">GST Levy: &nbsp;
                      <span className="font-black">₹{currentOutward.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </p>
                    <div className="border-t-2 border-slate-900 w-full md:w-3/4 pt-2 mt-2">
                      <p className="text-sm text-slate-400 font-bold">HOSPITAL GRAND TOTAL</p>
                      <p className="text-xl font-black text-emerald-800 tracking-tight">₹{currentOutward.grandTotal.toLocaleString('en-IN')} <span className="text-xs text-slate-500 font-normal">INR</span></p>
                    </div>
                  </div>
                </div>

                {/* Verification footer with signatures and secure compliance logos */}
                <div className="grid grid-cols-2 gap-10 pt-12 border-t border-slate-200">
                  <div className="text-left font-mono space-y-4">
                    <div className="h-10 border-b border-dashed border-slate-300 w-3/4"></div>
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 font-mono">Patient Receipt signature</p>
                      <p className="text-[10px] text-slate-600 font-sans font-medium mt-0.5"> Ramesh Kumar </p>
                    </div>
                  </div>
                  <div className="text-right font-mono space-y-4">
                    <div className="h-10 flex justify-end items-end">
                      <span className="text-[10px] uppercase font-bold tracking-tight bg-blue-50 text-blue-700 border border-blue-100 p-1 px-2.5 rounded font-mono">
                        ✓ SECURE VERIFIED
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 font-mono">Authorized Signatory</p>
                      <p className="text-[10px] text-slate-650 font-bold uppercase font-mono mt-0.5">{currentOutward.doctorName || 'Dr. Dasaradha K.'} (MediCore ERP)</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Secure metadata bar */}
                <div className="border-t border-slate-200 pt-6 flex flex-col md:flex-row justify-between items-center text-[8.5px] font-mono text-slate-400" id="print-sheet-footer">
                  <span className="uppercase font-bold tracking-wider">🔒 HIPAA SECURE COMPLIANT GATEWAY ● SYMMETRIC AES-256</span>
                  <span>Generated by user: {staffProfile?.name || 'Administrator'} ● Stamp ID: {currentOutward.invoiceId}</span>
                </div>

              </div>
            )}

            {/* CLINICAL INWARD (VENDOR SUPPLIES) BILL RECEIPT RENDER */}
            {selectedInvoiceType === 'inward' && currentInward && (
              <div className="space-y-8" id="inward-invoice-print-area">
                
                {/* Invoice Receipt Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black">
                      MC
                    </div>
                    <div>
                      <h1 className="text-md font-black tracking-tight text-slate-900 uppercase">MEDICORE ENTERPRISE</h1>
                      <p className="text-[9px] text-slate-500 font-mono tracking-wider font-bold">PROCUREMENT EXPENDITURE RECORD</p>
                      <p className="text-[9px] text-slate-400 font-sans tracking-tight font-medium">Inward Medical Supplies & Stock Receipts Audit</p>
                    </div>
                  </div>
                  <div className="text-right md:text-right font-mono">
                    <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-100 p-1 px-2.5 rounded-full block w-fit ml-auto mb-2">
                      INWARD PROC EXPENSE
                    </span>
                    <p className="text-xs text-slate-500 font-semibold">Expense ID: &nbsp;
                      <span className="text-slate-850 font-black text-xs">{currentInward.invoiceId}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold">Tally Date: {currentInward.invoiceDate}</p>
                  </div>
                </div>

                {/* Vendor and Department Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs font-mono">
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <Building2 size={11} className="text-slate-500" /> Vendor / Supplier details
                    </span>
                    <p className="font-sans text-sm font-bold text-slate-850">
                      {currentInward.vendorName}
                    </p>
                    <p className="text-slate-500">Vendor GSTIN: &nbsp;
                      <span className="text-slate-850 font-bold uppercase">{currentInward.vendorGstin || 'Not Registered'}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <FileText size={11} className="text-slate-500" /> Procurement Parameters
                    </span>
                    <p className="text-slate-500 font-sans">Expenditure Dept: &nbsp;
                      <span className="text-slate-800 font-bold uppercase">{currentInward.department}</span>
                    </p>
                    <p className="text-slate-500">Method: &nbsp;
                      <span className="text-slate-800 font-bold uppercase">{currentInward.paymentMode}</span>
                    </p>
                    <p className="text-slate-500">Status: &nbsp;
                      <span className={`font-black uppercase px-2 py-0.5 rounded-md text-[9px] ${currentInward.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {currentInward.paymentStatus}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Inward Items detailed articles table */}
                <div className="space-y-3">
                  <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest block">
                    📦 INWARD PROCURED ARTICLES
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left" id="inward-items-table">
                      <thead className="bg-slate-50 text-[10px] font-mono font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">S.No</th>
                          <th className="px-4 py-3">Material Formulation / Batch / Specifications</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Rate Unit (₹)</th>
                          <th className="px-4 py-3 text-right">GST Rate</th>
                          <th className="px-4 py-3 text-right">GST Collected (₹)</th>
                          <th className="px-4 py-3 text-right">Subtotal (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        {currentInward.items.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-mono text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3 font-sans font-bold text-slate-800 max-w-[250px] truncate">{item.description}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium">{item.quantity}</td>
                            <td className="px-4 py-3 text-right font-mono">₹{item.unitPrice.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-600">{item.gstRate}%</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500">₹{item.gstAmount.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-mono font-black text-slate-900">₹{item.total.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Input GST Credit calculations and totals */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-3 border-t border-slate-200">
                  <div className="md:col-span-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-[10px] font-mono space-y-2">
                    <span className="font-black text-slate-500 uppercase tracking-wide block border-b border-slate-200 pb-1.5 flex items-center justify-between">
                      <span>🏛️ INPUT TAX CREDIT (ITC) DEVOLUTION</span>
                      <span className="text-[9px] uppercase tracking-normal bg-amber-50 text-amber-700 border border-indigo-100 p-0.5 px-1.5 rounded">CREDIT REVENUE SLABS</span>
                    </span>
                    <div className="space-y-1.5 text-slate-600">
                      <div className="flex justify-between font-medium">
                        <span>Central CGST Credit Component:</span>
                        <span className="text-slate-800 font-bold">₹{(currentInward.gstTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>State SGST Credit Component:</span>
                        <span className="text-slate-800 font-bold">₹{(currentInward.gstTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-dashed border-slate-200 pt-1.5">
                        <span>Total Input GST Reclaimable:</span>
                        <span className="text-amber-750 font-black">₹{currentInward.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-6 flex flex-col justify-center items-end text-right font-mono space-y-1">
                    <p className="text-xs text-slate-500 font-semibold">Material Base Total: &nbsp;
                      <span className="text-slate-800 font-bold">₹{currentInward.subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="text-xs text-amber-600 font-extrabold font-mono">ITC Total: &nbsp;
                      <span className="font-black">₹{currentInward.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </p>
                    <div className="border-t-2 border-slate-900 w-full md:w-3/4 pt-2 mt-2">
                      <p className="text-sm text-slate-400 font-bold">HOSPITAL GRAND TOTAL</p>
                      <p className="text-xl font-black text-slate-900 tracking-tight">₹{currentInward.grandTotal.toLocaleString('en-IN')} <span className="text-xs text-slate-550 font-normal">INR</span></p>
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-10 pt-12 border-t border-slate-200">
                  <div className="text-left font-mono space-y-4">
                    <div className="h-10 border-b border-dashed border-slate-300 w-3/4"></div>
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 font-mono">Procurement Manager Signature</p>
                      <p className="text-[10px] text-slate-600 font-bold uppercase mt-0.5">{staffProfile?.name || 'Administrator'}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono space-y-4">
                    <div className="h-10 flex justify-end items-end">
                      <span className="text-[9px] uppercase font-bold tracking-tight bg-amber-50 text-amber-700 border border-amber-100 p-1 px-2.5 rounded font-mono">
                        LOGGED FOR COMPLIANCE
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 font-mono">Tally Audit Officer</p>
                      <p className="text-[10px] text-slate-650 font-bold uppercase font-mono mt-0.5">MediCore ERP Sys</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Secure metadata bar */}
                <div className="border-t border-slate-200 pt-6 flex flex-col md:flex-row justify-between items-center text-[8.5px] font-mono text-slate-400" id="print-sheet-footer">
                  <span className="uppercase font-bold tracking-wider">🔒 SECURE INTERNAL PROC-LEDGER ACCOUNT COMPLIANCY RECORD</span>
                  <span>Generated on session: {staffProfile?.name || 'Administrator'} ● Stamp ID: {currentInward.invoiceId}</span>
                </div>

              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
