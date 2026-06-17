import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Patient cryptographic keys. Defaults to 32-byte hashable secret.
const ENCRYPTION_KEY = process.env.PATIENT_ENCRYPTION_KEY || "medledger_secret_secure_key_32bytes_v1";
const IV_LENGTH = 16;

/**
 * Server-side Symmetric Encryption (AES-256-CBC)
 */
function encryptField(text: string): string {
  try {
    if (!text) return "";
    const key = crypto.createHash("sha256").update(String(ENCRYPTION_KEY)).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (error) {
    console.error("Encryption failed:", error);
    return "CIPHER_ERR";
  }
}

/**
 * Server-side Symmetric Decryption
 */
function decryptField(cipherText: string): string {
  try {
    if (!cipherText || !cipherText.includes(":")) return cipherText;
    const key = crypto.createHash("sha256").update(String(ENCRYPTION_KEY)).digest();
    const parts = cipherText.split(":");
    const iv = Buffer.from(parts.shift()!, "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[DECRYPT_ERROR - SECURE LOCK_ACTIVE]";
  }
}

// Ensure lazy-loading of Gemini client to prevent startup failure
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY not configured in environment backend.");
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// ---------------- API ENDPOINTS ----------------

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Patient Data Encryption Utility
app.post("/api/patient/encrypt", (req, res) => {
  const { name, patientId, contact, treatment } = req.body;
  res.json({
    patientNameEncrypted: encryptField(name || ""),
    patientIdEncrypted: encryptField(patientId || ""),
    patientContactEncrypted: encryptField(contact || ""),
    treatmentDescriptionEncrypted: encryptField(treatment || ""),
  });
});

// Prescription Data Encryption Utility
app.post("/api/prescription/encrypt", (req, res) => {
  const { name, patientId, contact, symptoms, diagnosis } = req.body;
  res.json({
    patientNameEncrypted: encryptField(name || ""),
    patientIdEncrypted: encryptField(patientId || ""),
    patientContactEncrypted: encryptField(contact || ""),
    symptomsEncrypted: encryptField(symptoms || ""),
    diagnosisEncrypted: encryptField(diagnosis || ""),
  });
});

// Prescription Data Decryption batch logic for authenticated sessions
app.post("/api/prescription/decrypt-batch", (req, res) => {
  const { prescriptions } = req.body;
  if (!Array.isArray(prescriptions)) {
    return res.status(400).json({ error: "Invalid prescriptions format provided" });
  }

  const decryptedList = prescriptions.map((pres: any) => {
    return {
      ...pres,
      patientName: decryptField(pres.patientNameEncrypted),
      patientId: decryptField(pres.patientIdEncrypted),
      patientContact: decryptField(pres.patientContactEncrypted),
      symptoms: decryptField(pres.symptomsEncrypted),
      diagnosis: decryptField(pres.diagnosisEncrypted),
    };
  });

  res.json({ decryptedPrescriptions: decryptedList });
});

// Patient Data Decryption batch logic for authenticated sessions
app.post("/api/patient/decrypt-batch", (req, res) => {
  const { invoices } = req.body;
  if (!Array.isArray(invoices)) {
    return res.status(400).json({ error: "Invalid invoices format provided" });
  }

  const decryptedList = invoices.map((invoice: any) => {
    return {
      ...invoice,
      patientName: decryptField(invoice.patientNameEncrypted),
      patientId: decryptField(invoice.patientIdEncrypted),
      patientContact: decryptField(invoice.patientContactEncrypted),
      treatmentDescription: decryptField(invoice.treatmentDescriptionEncrypted),
    };
  });

  res.json({ decryptedInvoices: decryptedList });
});

// AI automated financial auditing generator leveraging Gemini 3.5 Flash
app.post("/api/reports/generate", async (req, res) => {
  const { summaryDate, totalInward, totalOutward, taxCollected, taxPaid, cash, upi, phonepe, googlepay, departmentBreakdown } = req.body;

  const summaryPrompt = `
Generate a highly professional, clinical-grade executive financial report and audit summary for MedLedger Healthcare Enterprise.
Date of Audit: ${summaryDate || new Date().toISOString().split("T")[0]}

Operational Ledger Statistics:
- Total Inward Procurement Expenses: INR ${totalInward || 0}
- Total Outward Revenue Bills: INR ${totalOutward || 0}
- GST Tax Collected (Patient Billing): INR ${taxCollected || 0}
- GST Tax Paid (Vendor Purchases): INR ${taxPaid || 0}
- Net GST Position (Liability/Credit): INR ${(taxCollected || 0) - (taxPaid || 0)}
- Cash Drawer Receipts: INR ${cash || 0}
- UPI Unified Payments: INR ${upi || 0}
- PhonePe Direct: INR ${phonepe || 0}
- GooglePay Transactions: INR ${googlepay || 0}

Department-wise Revenue Distributions:
${JSON.stringify(departmentBreakdown || {}, null, 2)}

Provide a strict, formal medical-audit structure with:
1. Executive Summary & Compliance Stamp
2. Departmental Performance Analytics & Anomalies (e.g. comparing Outpatient vs. Pharmacy relative ratios)
3. Tax & Tally Integrity Checklist (detailing CGST/SGST/IGST breakdown considerations based on standard Indian slab rates like 5%, 12%, 18%)
4. Secure Payment Mode Tallying (highlighting cash drawer versus digital UPI velocity)
5. Strict Recommendations for Next Fiscal Cycle (incorporating security/access guidelines)
`;

  try {
    const client = getGeminiClient();
    if (!client) {
      // Elegant rule-based fallback report to keep app beautiful and useful without key
      const fallbackReport = `## MEDLEDGER COMPLIANCE & FINANCIAL EXECUTIVE REPORT (FALLBACK ENGINE)
**Status**: Real-Time Tally Calculations Complete
**System Notice**: Server AI summaries require setting your active \`GEMINI_API_KEY\` tab via AI Studio ui Secrets config.

### 1. Executive Summary
During this fiscal ledger period starting **${summaryDate}**, total inward procurement of clinical provisions was recorded at **INR ${totalInward}**, and total outward clinical patient revenue recorded **INR ${totalOutward}**, resulting in a net operational position of **INR ${(totalOutward - totalInward).toFixed(2)}**.

### 2. Department-wise GST Tally & Tax Breakdown
* Total GST Collected (Sales): **INR ${taxCollected}**
* Total GST Paid (Purchases): **INR ${taxPaid}**
* Net Payable GST Liability: **INR ${(taxCollected - taxPaid).toFixed(2)}**
* Suggested Tally.ERP Ledger Mapping:
  * Central GST Ledger (CGST 50% Share): INR ${((taxCollected - taxPaid) / 2).toFixed(2)}
  * State GST Ledger (SGST 50% Share): INR ${((taxCollected - taxPaid) / 2).toFixed(2)}

### 3. Payment Method Velocity
* **Cash Ledger**: INR ${cash}
* **UPI / GooglePay / PhonePe Ledger**: INR ${(upi + googlepay + phonepe).toFixed(2)}
* High digital payment velocity of **${((upi + googlepay + phonepe) / (totalOutward || 1) * 100).toFixed(1)}%** reduces manual cash auditing discrepancies.

### 4. Operational Performance Breakdown
${Object.entries(departmentBreakdown || {})
  .map(([dept, data]: any) => `- **${dept}**: Outward collections INR ${data.outwardTotal || 0} against expenditures INR ${data.inwardTotal || 0}`)
  .join("\n")}
`;
      return res.json({ report: fallbackReport });
    }

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: summaryPrompt,
      config: {
        systemInstruction: "You are the head Chief Financial Officer (CFO) and Medical Compliance Auditor for a multi-specialty hospital enterprise. Write in a extremely precise, forensic, objective, and authoritative style.",
        temperature: 0.2
      }
    });

    res.json({ report: response.text || "Report generation returned empty content." });
  } catch (error: any) {
    console.error("AI Report generation failed:", error);
    res.status(500).json({ error: "Failed to generate AI report summary. Check backend credentials.", details: error.message });
  }
});

// ---------------- VITE MIDDLEWARE SETUP ----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Integrate Vite as middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets compiled inside /dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MedLedger Security Backend active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
