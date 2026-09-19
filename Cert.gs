// ===========================================================================
// CERT.GS — DECRYPT 2.0 CERTIFICATE ENGINE
// Add this file to your existing Apps Script project.
// Then add the two new routes shown at the bottom to your doGet in Code.gs.
// Nothing else in Code.gs, Admin.gs, or Portal.gs changes.
// ===========================================================================

// ---------------------------------------------------------------------------
// SEND CERTIFICATE EMAIL
// Called once per recipient by the browser engine.
// Receives the PDF as base64, attaches it, sends via MailApp,
// then marks the Certificates sheet row as Sent.
// ---------------------------------------------------------------------------

function handleSendCertificateEmail(e) {
  var code     = (e.parameter.code      || '').trim().toUpperCase();
  var name     = e.parameter.name       || '';
  var email    = e.parameter.email      || '';
  var subject  = e.parameter.subject    || 'Your DECRYPT 2.0 Certificate';
  var pdfB64   = e.parameter.pdfBase64  || '';
  var certRow  = Number(e.parameter.certRow) || 0;

  if (!email || !pdfB64 || !code) {
    return jsonResponse({ ok: false, error: 'Missing required fields.' });
  }

  try {
    /* Build PDF blob from base64 */
    var pdfBytes = Utilities.base64Decode(pdfB64);
    var pdfBlob  = Utilities.newBlob(pdfBytes, 'application/pdf',
                   'DECRYPT-2.0-Certificate-' + name.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.pdf');

    /* Verification URL embedded in the email body */
    var VERIFY_BASE = 'https://decrypt-portal.vercel.app/verify.html';
    var verifyUrl   = VERIFY_BASE + '?code=' + encodeURIComponent(code);

    /* Premium certificate delivery email */
    var htmlBody = buildCertificateEmail(name, code, verifyUrl);

    MailApp.sendEmail({
      to:          email,
      subject:     subject,
      htmlBody:    htmlBody,
      attachments: [pdfBlob]
    });

    /* Mark row as Sent in Certificates sheet */
    if (certRow > 1) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Certificates');
      if (sheet) {
        sheet.getRange(certRow, 6).setValue(new Date()); // Col F: Sent date
        sheet.getRange(certRow, 8).setValue('Sent');     // Col H: Status
      }
    }

    return jsonResponse({ ok: true });

  } catch (err) {
    console.error('Certificate send error: ' + err.toString());
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

// ---------------------------------------------------------------------------
// CERTIFICATE EMAIL TEMPLATE
// Premium design — dark green, certificate aesthetic.
// The design alone should make the recipient want to view their achievement.
// ---------------------------------------------------------------------------

function buildCertificateEmail(name, code, verifyUrl) {
  var firstName = name.trim().split(' ')[0];

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#050D08;font-family:'Helvetica Neue',Arial,sans-serif;">

<div style="max-width:580px;margin:0 auto;padding:32px 16px;">

  <!-- Header bar -->
  <div style="text-align:center;padding-bottom:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:4px;font-weight:700;
              text-transform:uppercase;color:#4A7A54;">DECRYPT 2.0</p>
  </div>

  <!-- Main card -->
  <div style="background-color:#0A1C10;border:1px solid #1A4D23;
              border-radius:16px;overflow:hidden;">

    <!-- Gold/green top accent stripe -->
    <div style="height:4px;background:linear-gradient(90deg,#07220C 0%,#9CF0B0 50%,#07220C 100%);"></div>

    <!-- Certificate icon area -->
    <div style="text-align:center;padding:40px 36px 28px;">
      <div style="display:inline-block;width:72px;height:72px;
                  background-color:#07220C;border:2px solid #1A4D23;
                  border-radius:50%;line-height:72px;font-size:28px;
                  margin-bottom:20px;">🏅</div>
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;
                font-weight:700;text-transform:uppercase;color:#4A7A54;">
        Certificate of Achievement
      </p>
      <h1 style="margin:10px 0 0;font-size:13px;letter-spacing:2px;
                 font-weight:400;color:#6B8A72;text-transform:uppercase;">
        This is to certify that
      </h1>
    </div>

    <!-- Name block -->
    <div style="text-align:center;padding:0 36px 32px;">
      <div style="border-top:1px solid #1A4D23;border-bottom:1px solid #1A4D23;
                  padding:22px 0;margin-bottom:24px;">
        <p style="margin:0;font-size:clamp(1.4rem,4vw,1.8rem);font-weight:700;
                  color:#FFFFFF;letter-spacing:2px;font-family:Georgia,serif;
                  font-style:italic;">
          ${name}
        </p>
      </div>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#9BAFA2;">
        has successfully participated in <strong style="color:#E8F5EC;">DECRYPT 2.0</strong>
        and unlocked new knowledge, skills and connections as part of our
        community of young technology enthusiasts, creatives, learners and builders.
      </p>
    </div>

    <!-- Certificate details -->
    <div style="margin:0 36px 28px;background-color:#050D08;
                border:1px solid #1A4D23;border-radius:10px;padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#6B7D71;font-size:11px;
                     letter-spacing:1.5px;text-transform:uppercase;
                     border-bottom:1px solid #0F2A15;">EDITION</td>
          <td style="padding:8px 0;font-size:13px;color:#E8F5EC;
                     text-align:right;border-bottom:1px solid #0F2A15;">DECRYPT 2.0</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6B7D71;font-size:11px;
                     letter-spacing:1.5px;text-transform:uppercase;
                     border-bottom:1px solid #0F2A15;">DATE</td>
          <td style="padding:8px 0;font-size:13px;color:#E8F5EC;
                     text-align:right;border-bottom:1px solid #0F2A15;">October 2026</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6B7D71;font-size:11px;
                     letter-spacing:1.5px;text-transform:uppercase;">CERTIFICATE ID</td>
          <td style="padding:8px 0;font-family:'Courier New',monospace;
                     font-size:12px;font-weight:700;color:#9CF0B0;text-align:right;">
            ${code}
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA — verify -->
    <div style="text-align:center;padding:0 36px 36px;">
      <p style="margin:0 0 18px;font-size:13px;color:#6B8A72;">
        Your certificate is attached to this email as a PDF.<br>
        You can also verify its authenticity online at any time.
      </p>
      <a href="${verifyUrl}"
         style="display:inline-block;background-color:#9CF0B0;color:#07220C;
                text-decoration:none;font-weight:700;font-size:13px;
                letter-spacing:1.5px;text-transform:uppercase;
                padding:14px 36px;border-radius:8px;">
        Verify Certificate →
      </a>
    </div>

    <!-- Bottom accent stripe -->
    <div style="height:2px;background:linear-gradient(90deg,#07220C 0%,#1A4D23 50%,#07220C 100%);"></div>

    <!-- Footer -->
    <div style="padding:20px 36px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#4A7A54;letter-spacing:1px;">
        Knowledge should not stay locked.<br>
        DECRYPT · A movement, not a moment.
      </p>
    </div>

  </div>

  <!-- Email footer -->
  <div style="text-align:center;padding:24px 0 8px;">
    <p style="margin:0;font-size:10px;color:#2A4A30;letter-spacing:1px;">
      DECRYPT 2.0 · OCTOBER 2026
    </p>
  </div>

</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CERTIFICATE VERIFICATION
// Public endpoint — no token needed, anyone with the verify URL can call it.
// Returns only: verified (bool), name, event, track, date.
// Never returns email, phone, or other private fields.
// ---------------------------------------------------------------------------

function handleVerifyCertificate(e) {
  var code = (e.parameter.code || '').trim().toUpperCase();
  if (!code) return jsonResponse({ verified: false, error: 'No code provided.' });

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    var data  = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var row     = data[i];
      var rowCode = String(row[COL.CODE] || '').trim().toUpperCase();

      if (rowCode === code) {
        var checkedIn = row[COL.STATUS] === 'CHECKED_IN';
        if (!checkedIn) {
          /* Registered but didn't attend — certificate not valid */
          return jsonResponse({ verified: false, reason: 'not_attended' });
        }
        return jsonResponse({
          verified:  true,
          name:      row[COL.NAME]  || '',
          track:     row[COL.TRACK] || 'General',
          event:     'DECRYPT 2.0',
          date:      'October 2026',
          code:      rowCode
        });
      }
    }

    return jsonResponse({ verified: false, reason: 'not_found' });

  } catch (err) {
    return jsonResponse({ verified: false, error: err.toString() });
  }
}

// ---------------------------------------------------------------------------
// ADD THESE ROUTES TO YOUR doGet IN Code.gs
//
// In the public routes section (no token needed):
//   if (action === 'verify_certificate') return handleVerifyCertificate(e);
//
// In ADMIN_ACTIONS in Admin.gs (token required):
//   'sendCertificateEmail': function(e) { return handleSendCertificateEmail(e); },
// ---------------------------------------------------------------------------
