/**
 * Branded invoice email HTML builder for Enclave Cabinetry.
 * Used for deposit, pre-install, and final invoice emails.
 */

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#2E5FA3"/><text x="24" y="33" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#ffffff">EC</text></svg>`;
const LOGO_URL = `data:image/svg+xml;base64,${btoa(LOGO_SVG)}`;

interface InvoiceEmailParams {
  invoiceNumber: string;
  customerName: string;
  customerFirstName: string;
  jobRef: string;
  jobTitle: string;
  milestone: "deposit" | "preinstall" | "final";
  amount: string; // formatted e.g. "5,000.00"
  paymentReference: string;
}

const MILESTONE_LABELS: Record<string, { description: string; paymentDueLabel: string }> = {
  deposit: {
    description: "50% Deposit",
    paymentDueLabel: "Deposit Payment Due",
  },
  preinstall: {
    description: "40% Pre-Install Payment",
    paymentDueLabel: "Pre-Install Payment Due",
  },
  final: {
    description: "10% Final Payment",
    paymentDueLabel: "Final Payment Due",
  },
};

// Extract short invoice number: "DEP-031_StevensonBrosDoors" -> "DEP-031"
function shortenInvoiceNumber(invoiceNumber: string, jobRef: string): string {
  const prefixMatch = invoiceNumber.match(/^([A-Za-z]+-)/);
  const numericPrefix = jobRef.split("_")[0]?.match(/^(\d+)/)?.[1];

  if (prefixMatch?.[1] && numericPrefix) {
    return `${prefixMatch[1]}${numericPrefix}`;
  }

  const underscoreIdx = invoiceNumber.indexOf("_");
  if (underscoreIdx > 0) return invoiceNumber.slice(0, underscoreIdx);
  return invoiceNumber;
}

export function buildInvoiceEmailHtml(params: InvoiceEmailParams): string {
  const { invoiceNumber, customerName, customerFirstName, jobRef, jobTitle, milestone, amount, paymentReference } = params;
  const labels = MILESTONE_LABELS[milestone];
  const lineDescription = `${labels.description} — ${jobTitle}`;
  const shortInvoiceNumber = shortenInvoiceNumber(invoiceNumber, jobRef);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- HEADER -->
  <tr><td style="padding:28px 32px 20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <img src="${LOGO_URL}" alt="Enclave Cabinetry" width="48" height="48" style="display:block;border-radius:8px;" />
        </td>
        <td style="text-align:right;vertical-align:top;">
          <span style="font-size:12px;color:#666;">Enclave Cabinetry Invoice</span>
        </td>
      </tr>
    </table>
    <h1 style="margin:20px 0 8px 0;font-size:22px;color:#1a1a1a;border-bottom:3px solid #2E5FA3;padding-bottom:10px;">
      Invoice — ${shortInvoiceNumber}
    </h1>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#444;line-height:1.6;">
      <tr><td>
        <strong>Enclave Cabinetry</strong><br/>
        Designer: Alistair Wood<br/>
        Email: alistair@enclavecabinetry.com<br/>
        Mobile: 07944608098
      </td></tr>
    </table>
  </td></tr>

  <!-- BILL TO -->
  <tr><td style="padding:0 32px 16px 32px;">
    <p style="margin:0 0 4px 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Bill To:</p>
    <p style="margin:0;font-size:15px;font-weight:bold;color:#1a1a1a;">${customerName}</p>
  </td></tr>

  <!-- LINE ITEMS TABLE -->
  <tr><td style="padding:0 32px 20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
      <tr style="background:#2E5FA3;color:#ffffff;">
        <td style="padding:10px 12px;font-weight:bold;border-radius:4px 0 0 0;">Description</td>
        <td style="padding:10px 12px;font-weight:bold;text-align:center;" width="70">Quantity</td>
        <td style="padding:10px 12px;font-weight:bold;text-align:right;" width="100">Unit Price</td>
        <td style="padding:10px 12px;font-weight:bold;text-align:right;border-radius:0 4px 0 0;" width="100">Total</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e5e5;">
        <td style="padding:12px;color:#333;">${lineDescription}</td>
        <td style="padding:12px;text-align:center;color:#333;">1No</td>
        <td style="padding:12px;text-align:right;color:#333;">£${amount}</td>
        <td style="padding:12px;text-align:right;color:#333;font-weight:bold;">£${amount}</td>
      </tr>
    </table>
  </td></tr>

  <!-- SUBTOTAL & PAYMENT -->
  <tr><td style="padding:0 32px 24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr>
        <td style="text-align:right;padding:6px 0;color:#666;">Subtotal:</td>
        <td style="text-align:right;padding:6px 0;font-weight:bold;color:#1a1a1a;" width="120">£${amount}</td>
      </tr>
      <tr>
        <td style="text-align:right;padding:6px 0;color:#666;">${labels.paymentDueLabel}:</td>
        <td style="text-align:right;padding:6px 0;font-weight:bold;font-size:15px;color:#2E5FA3;" width="120">£${amount}</td>
      </tr>
    </table>
  </td></tr>

  <!-- PAYMENT DETAILS -->
  <tr><td style="padding:0 32px 24px 32px;">
    <div style="background:#f8f9fa;border:1px solid #e5e5e5;border-radius:6px;padding:16px;">
      <p style="margin:0 0 8px 0;font-weight:bold;font-size:13px;color:#1a1a1a;">Payment Details:</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#444;line-height:1.8;">
        <tr><td style="padding-right:12px;">Name:</td><td>Enclave Cabinetry</td></tr>
        <tr><td style="padding-right:12px;">Sort Code:</td><td>04-00-03</td></tr>
        <tr><td style="padding-right:12px;">Account No:</td><td>75471656</td></tr>
        <tr><td style="padding-right:12px;">Reference:</td><td><strong>${paymentReference}</strong></td></tr>
      </table>
      <p style="margin:12px 0 0 0;font-size:12px;color:#666;">Payment by Bank Transfer, Credit or Debit Card.</p>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:0 32px 28px 32px;text-align:center;">
    <p style="margin:0 0 16px 0;font-size:14px;color:#1a1a1a;font-weight:500;">Thank you for your business.</p>
    <img src="${LOGO_URL}" alt="EC" width="32" height="32" style="display:block;margin:0 auto;border-radius:6px;opacity:0.6;" />
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
