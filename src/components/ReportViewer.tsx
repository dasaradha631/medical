import React, { useState } from 'react';
import { DecryptedOutwardInvoice, InwardInvoice } from '../types';
import { FileText, Award, RefreshCw, AlertCircle, TrendingUp, Sparkles, Receipt } from 'lucide-react';

interface ReportViewerProps {
  outwardInvoices: DecryptedOutwardInvoice[];
  inwardInvoices: InwardInvoice[];
  departments: string[];
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  outwardInvoices,
  inwardInvoices,
  departments,
}) => {
  const [reportText, setReportText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // aggregate statistics for the AI payload
  const totalOutward = outwardInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalInward = inwardInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const taxCollected = outwardInvoices.reduce((sum, i) => sum + i.gstTotal, 0);
  const taxPaid = inwardInvoices.reduce((sum, i) => sum + i.gstTotal, 0);

  const cash = outwardInvoices.filter(i => i.paymentMode === 'Cash').reduce((sum, i) => sum + i.grandTotal, 0);
  const upi = outwardInvoices.filter(i => i.paymentMode === 'UPI').reduce((sum, i) => sum + i.grandTotal, 0);
  const phonepe = outwardInvoices.filter(i => i.paymentMode === 'PhonePe').reduce((sum, i) => sum + i.grandTotal, 0);
  const googlepay = outwardInvoices.filter(i => i.paymentMode === 'GooglePay').reduce((sum, i) => sum + i.grandTotal, 0);

  const fetchAIReport = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const departmentBreakdown: Record<string, { inwardTotal: number; outwardTotal: number }> = {};
      departments.forEach(dept => {
        departmentBreakdown[dept] = {
          inwardTotal: inwardInvoices.filter(i => i.department === dept).reduce((sum, i) => sum + i.grandTotal, 0),
          outwardTotal: outwardInvoices.filter(i => i.department === dept).reduce((sum, i) => sum + i.grandTotal, 0),
        };
      });

      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryDate: new Date().toISOString().split('T')[0],
          totalInward,
          totalOutward,
          taxCollected,
          taxPaid,
          cash,
          upi,
          phonepe,
          googlepay,
          departmentBreakdown,
        }),
      });

      if (!response.ok) {
        throw new Error('Server returned error status when generating audit');
      }

      const data = await response.json();
      setReportText(data.report || 'Empty report returned');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to construct server connection or load Gemini credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to visually render markdown paragraph blocks safely in React
  const renderFormattedReport = (rawText: string) => {
    if (!rawText) return null;

    const lines = rawText.split('\n');
    return lines.map((line, idx) => {
      // 1. Headings
      if (line.startsWith('###')) {
        return (
          <h4 key={idx} className="text-sm font-bold text-sky-300 mt-5 mb-2 font-mono border-b border-slate-800 pb-1">
            {line.replace('###', '').trim()}
          </h4>
        );
      }
      if (line.startsWith('##')) {
        return (
          <h3 key={idx} className="text-base font-bold text-emerald-400 mt-6 mb-3 uppercase tracking-wide">
            {line.replace('##', '').trim()}
          </h3>
        );
      }
      if (line.startsWith('#')) {
        return (
          <h2 key={idx} className="text-lg font-black text-slate-50 mt-6 mb-4 border-l-4 border-blue-500 pl-3">
            {line.replace('#', '').trim()}
          </h2>
        );
      }

      // 2. Bold tags
      let formattedLine = line;
      const boldSegments = line.match(/\*\*(.*?)\*\*/g);
      let contentNode: React.ReactNode = line;

      if (boldSegments) {
        const parts: React.ReactNode[] = [];
        let tempText = line;
        boldSegments.forEach((segment) => {
          const rawSegment = segment.slice(2, -2);
          const splitIdx = tempText.indexOf(segment);
          if (splitIdx > -1) {
            parts.push(tempText.substring(0, splitIdx));
            parts.push(<strong key={segment} className="text-white font-extrabold">{rawSegment}</strong>);
            tempText = tempText.substring(splitIdx + segment.length);
          }
        });
        parts.push(tempText);
        contentNode = <span className="text-slate-250">{parts}</span>;
      }

      // 3. Unordered Lists
      if (line.startsWith('*') || line.startsWith('-')) {
        return (
          <li key={idx} className="ml-5 list-disc text-xs text-slate-300 leading-relaxed py-1">
            {contentNode}
          </li>
        );
      }

      // 4. Empty state
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed mb-2">
          {contentNode}
        </p>
      );
    });
  };

  return (
    <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm" id="report-view-container">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="report-header">
        <div>
          <h2 className="text-sm font-black text-slate-800 tracking-wider font-mono flex items-center gap-2">
            <FileText className="text-blue-600" size={17} /> EXECUTIVE FINANCIAL AUDIT CENTRAL
          </h2>
          <p className="text-[11px] text-slate-450 font-semibold mt-1">Generates complete department ledger audits and compliance statements powered by Gemini 3.5.</p>
        </div>
        <button
          onClick={fetchAIReport}
          disabled={isLoading}
          className="px-4 py-2.5 bg-blue-650 hover:bg-blue-700 transition-all font-mono font-bold rounded-xl text-xs text-white flex items-center gap-2 disabled:opacity-40 shadow-sm"
          id="btn-trigger-audit"
        >
          {isLoading ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          {isLoading ? 'Processing Ledger Records...' : 'Generate Compliance Audit'}
        </button>
      </div>

      {errorMsg && (
        <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-semibold" id="report-error">
          <AlertCircle size={15} className="mt-0.5 text-rose-500" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Main reporting view screen */}
      <div className="mt-6 border border-slate-900 rounded-2xl bg-slate-950 overflow-hidden shadow-md" id="report-content-body">
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-950 flex justify-between items-center text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block animate-pulse" />
            <span className="font-bold">MedLedger Real-Time Tally.ERP Export Engine</span>
          </div>
          <span className="font-bold text-slate-500">SECURE TALLY TUNNEL ACTIVE</span>
        </div>

        <div className="p-6 max-h-[550px] overflow-y-auto">
          {reportText ? (
            <div className="space-y-1 font-sans text-slate-200">
              {renderFormattedReport(reportText)}
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center text-center text-xs text-slate-550" id="report-empty-overlay">
              <FileText size={48} className="text-slate-800 mb-3" />
              <p className="font-mono text-slate-400 font-bold uppercase tracking-wider">No Active Executive Report Run</p>
              <p className="text-[11px] text-slate-500 max-w-sm mt-1.5 leading-normal font-sans">
                Click "Generate Compliance Audit" above to run hospital outward bills, inward vendor payments and departmental ledger statements through our automated analytics engine.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
