import React from 'react';
import { DecryptedOutwardInvoice, InwardInvoice, DepartmentLedgerAggregate } from '../types';
import { TrendingUp, TrendingDown, DollarSign, Wallet, Users, ArrowUpRight, ShieldCheck } from 'lucide-react';

interface GSTTaxTallyProps {
  outwardInvoices: DecryptedOutwardInvoice[];
  inwardInvoices: InwardInvoice[];
  departments: string[];
}

export const GSTTaxTally: React.FC<GSTTaxTallyProps> = ({
  outwardInvoices,
  inwardInvoices,
  departments,
}) => {
  // 1. Calculate General Financial KPIs
  const totalOutwardAmount = outwardInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalInwardAmount = inwardInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const netRevenue = totalOutwardAmount - totalInwardAmount;

  const totalGstCollected = outwardInvoices.reduce((sum, inv) => sum + inv.gstTotal, 0);
  const totalGstPaid = inwardInvoices.reduce((sum, inv) => sum + inv.gstTotal, 0);
  const netGstLiability = totalGstCollected - totalGstPaid;

  // 2. Payments Breakdowns
  const paymentsSummary = {
    Cash: outwardInvoices.filter(i => i.paymentMode === 'Cash').reduce((sum, i) => sum + i.grandTotal, 0),
    PhonePe: outwardInvoices.filter(i => i.paymentMode === 'PhonePe').reduce((sum, i) => sum + i.grandTotal, 0),
    GooglePay: outwardInvoices.filter(i => i.paymentMode === 'GooglePay').reduce((sum, i) => sum + i.grandTotal, 0),
    UPI: outwardInvoices.filter(i => i.paymentMode === 'UPI').reduce((sum, i) => sum + i.grandTotal, 0),
  };

  const totalDigitalPayments = paymentsSummary.PhonePe + paymentsSummary.GooglePay + paymentsSummary.UPI;
  const digitalPercentage = totalOutwardAmount > 0 ? (totalDigitalPayments / totalOutwardAmount) * 100 : 0;

  // 3. Department Wise aggregation
  const departmentalAggregates: DepartmentLedgerAggregate[] = departments.map(dept => {
    const deptOutward = outwardInvoices.filter(i => i.department === dept);
    const deptInward = inwardInvoices.filter(i => i.department === dept);

    const outwardTotal = deptOutward.reduce((sum, i) => sum + i.grandTotal, 0);
    const inwardTotal = deptInward.reduce((sum, i) => sum + i.grandTotal, 0);
    const gstCollected = deptOutward.reduce((sum, i) => sum + i.gstTotal, 0);
    const gstPaid = deptInward.reduce((sum, i) => sum + i.gstTotal, 0);

    const cashRevenue = deptOutward.filter(i => i.paymentMode === 'Cash').reduce((sum, i) => sum + i.grandTotal, 0);
    const upiRevenue = deptOutward.filter(i => i.paymentMode !== 'Cash').reduce((sum, i) => sum + i.grandTotal, 0);

    return {
      department: dept,
      inwardTotal,
      outwardTotal,
      gstCollected,
      gstPaid,
      cashRevenue,
      upiRevenue,
      netPosition: outwardTotal - inwardTotal,
    };
  });

  return (
    <div className="space-y-6">
      {/* Visual Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="metric-cards">
        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm transition-all hover:shadow-md" id="kpi-outward">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Outward Patients</p>
              <h3 className="text-2xl font-black mt-1 text-slate-800">₹{totalOutwardAmount.toLocaleString('en-IN')}</h3>
            </div>
            <span className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100 shadow-sm">
              <TrendingUp size={16} />
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-semibold font-sans">
            Total active billing receipts
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm transition-all hover:shadow-md" id="kpi-inward">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Inward Procurements</p>
              <h3 className="text-2xl font-black mt-1 text-slate-800">₹{totalInwardAmount.toLocaleString('en-IN')}</h3>
            </div>
            <span className="p-2.5 bg-amber-50 rounded-xl text-amber-600 border border-amber-100 shadow-sm">
              <TrendingDown size={16} />
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-semibold font-sans">
            Procurements & bills paid
          </p>
        </div>

        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm transition-all hover:shadow-md" id="kpi-gst-tally">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Net GST Liabilities</p>
              <h3 className={`text-2xl font-black mt-1 ${netGstLiability >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                ₹{netGstLiability.toLocaleString('en-IN')}
              </h3>
            </div>
            <span className="p-2.5 bg-blue-50 rounded-xl text-blue-600 border border-blue-100 shadow-sm">
              <ShieldCheck size={16} />
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-2 font-mono flex justify-between border-t border-slate-100 pt-1.5 font-bold">
            <span>Collect: ₹{totalGstCollected.toLocaleString('en-IN')}</span>
            <span>Paid: ₹{totalGstPaid.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm transition-all hover:shadow-md" id="kpi-net-income">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Net Hospital Margin</p>
              <h3 className={`text-2xl font-black mt-1 ${netRevenue >= 0 ? 'text-emerald-650' : 'text-rose-600'}`}>
                ₹{netRevenue.toLocaleString('en-IN')}
              </h3>
            </div>
            <span className="p-2.5 bg-slate-50 rounded-xl text-slate-600 border border-slate-150 shadow-sm">
              <DollarSign size={16} />
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-semibold font-sans">
            Revenue minus procurement metrics
          </p>
        </div>
      </div>

      {/* Tax Tally Balance & Payment Speed Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="tally-breakdown-row">
        {/* Payment Modes Ledger Breakdown */}
        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col justify-between" id="payment-ledgers">
          <div>
            <h2 className="text-xs font-black tracking-wider text-slate-800 uppercase font-mono flex items-center gap-2">
              <Wallet size={15} className="text-blue-600" /> Payment Velocity Ledger
            </h2>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">Real-time breakdown of transaction split.</p>

            <div className="space-y-4 mt-6">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1 font-bold">
                  <span className="text-slate-500">Cash Receipts</span>
                  <span className="text-slate-800">₹{paymentsSummary.Cash.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500" 
                    style={{ width: `${totalOutwardAmount > 0 ? (paymentsSummary.Cash / totalOutwardAmount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1 font-bold">
                  <span className="text-slate-500">PhonePe UPI</span>
                  <span className="text-slate-800">₹{paymentsSummary.PhonePe.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-650" 
                    style={{ width: `${totalOutwardAmount > 0 ? (paymentsSummary.PhonePe / totalOutwardAmount) * 105 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1 font-bold">
                  <span className="text-slate-500">GooglePay (GPay)</span>
                  <span className="text-slate-800">₹{paymentsSummary.GooglePay.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-650" 
                    style={{ width: `${totalOutwardAmount > 0 ? (paymentsSummary.GooglePay / totalOutwardAmount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1 font-bold">
                  <span className="text-slate-500">Generic UPI QR</span>
                  <span className="text-slate-800">₹{paymentsSummary.UPI.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${totalOutwardAmount > 0 ? (paymentsSummary.UPI / totalOutwardAmount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-900 rounded-xl mt-6 text-center text-white relative overflow-hidden shadow-sm">
            <span className="text-[10px] text-slate-400 font-mono font-bold tracking-wider uppercase block">Digital Coverage Ratio</span>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tracking-tight">{digitalPercentage.toFixed(1)}%</div>
            <p className="text-[9px] text-slate-400 mt-1 max-w-xs mx-auto leading-normal">Digital transactions decrease direct treasury handling.</p>
          </div>
        </div>

        {/* Detailed Daily Ledger summaries for every department */}
        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm lg:col-span-2" id="department-tally-table">
          <h2 className="text-xs font-black tracking-wider text-slate-800 uppercase font-mono flex items-center gap-2">
            <Users size={15} className="text-blue-600" /> Departmental Tally ledger
          </h2>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">Direct comparative statement of clinic outward billing and logistics expenses.</p>

          <div className="overflow-x-auto mt-6 border border-slate-200/60 rounded-xl">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs font-mono text-slate-700">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3 font-bold">&nbsp;Department</th>
                  <th className="px-4 py-3 text-right font-bold">Outward (INR)</th>
                  <th className="px-4 py-3 text-right font-bold">Inward (INR)</th>
                  <th className="px-4 py-3 text-right font-bold">GST Col.</th>
                  <th className="px-4 py-3 text-right font-bold">GST Paid</th>
                  <th className="px-4 py-3 text-right font-bold">Net Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {departmentalAggregates.map((row) => (
                  <tr key={row.department} className="hover:bg-slate-50/55 transition-colors">
                    <td className="px-4 py-3 text-slate-900 font-bold font-sans">{row.department}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-650">+₹{row.outwardTotal.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-500">-₹{row.inwardTotal.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-indigo-600">₹{row.gstCollected.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-amber-600">₹{row.gstPaid.toLocaleString('en-IN')}</td>
                    <td className={`px-4 py-3 text-right font-bold ${row.netPosition >= 0 ? 'text-emerald-700 bg-emerald-50/40' : 'text-rose-600 bg-rose-50/40'}`}>
                      ₹{row.netPosition.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
