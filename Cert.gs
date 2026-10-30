// ===========================================================================
// CERT.GS — DECRYPT 2.0 CERTIFICATE ENGINE
// Add this file to your existing Apps Script project.
// Wire verify_certificate into doGet and sendCertificateEmail into the
// POST/admin action dispatcher. The send dispatcher must read action from
// e.postData.contents because the browser sends a JSON request body.
// ===========================================================================

// ---------------------------------------------------------------------------
// SEND CERTIFICATE EMAIL
// Called once per recipient by the browser engine.
// Receives the PDF as base64, attaches it, sends via MailApp,
// then marks the Certificates sheet row as Sent.
// ---------------------------------------------------------------------------

function handleSendCertificateEmail(e) {
  var params = e.parameter || {};
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ ok: false, error: 'Invalid request body.' });
      }
      params = Object.assign({}, params, body);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'Invalid JSON request body.' });
    }
  }

  var code     = String(params.code || '').trim().toUpperCase();
  var name     = String(params.name || '');
  var email    = String(params.email || '');
  var subject  = String(params.subject || 'Your DECRYPT 2.0 Certificate');
  var pdfB64   = String(params.pdfBase64 || '');
  var certRow  = Number(params.certRow) || 0;

  if (!email || !pdfB64 || !code) {
    return jsonResponse({ ok: false, error: 'Missing required fields.' });
  }

  try {
    /* Build PDF blob from base64 */
    var pdfBytes = Utilities.base64Decode(pdfB64);
    var pdfBlob  = Utilities.newBlob(pdfBytes, 'application/pdf',
                   'DECRYPT-2.0-Certificate-' + name.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.pdf');

    /* Verification URL embedded in the email body */
    var VERIFY_BASE = 'https://decrypt-certficate.vercel.app/verify.html';
    var verifyUrl   = VERIFY_BASE + '?code=' + encodeURIComponent(code);

    /* Premium certificate delivery email */
    var htmlBody = buildCertificateEmail(name, code, verifyUrl);

    var plainBody = 'Hello ' + (name.trim().split(' ')[0] || 'there') +
      ', your DECRYPT 2.0 certificate is attached as a PDF.';
    MailApp.sendEmail(email, subject, plainBody, {
      htmlBody:    htmlBody,
      attachments: [pdfBlob]
    });

    updateCertificateRecord(code, certRow, verifyUrl);

    return jsonResponse({ ok: true });

  } catch (err) {
    console.error('Certificate send error: ' + err.toString());
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function findCertificateColumn(headers, names, fallbackIndex) {
  var normalizedNames = names.map(function (name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  });
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedNames.indexOf(header) !== -1) return i;
  }
  return fallbackIndex;
}

function updateCertificateRecord(code, certRow, verifyUrl) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Certificates');
  if (!sheet) throw new Error('Certificates sheet was not found.');

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('Certificates sheet has no header row.');

  var headers = values[0];
  var codeColumn = findCertificateColumn(
    headers, ['code', 'certificate code', 'certificate id', 'access code'], 0
  );
  var rowNumber = Number(certRow);
  if (rowNumber < 2 || rowNumber > values.length ||
      String(values[rowNumber - 1][codeColumn] || '').trim().toUpperCase() !== code) {
    rowNumber = 0;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][codeColumn] || '').trim().toUpperCase() === code) {
        rowNumber = i + 1;
        break;
      }
    }
  }
  if (!rowNumber) throw new Error('Certificate row was not found for code ' + code + '.');

  var generatedColumn = findCertificateColumn(headers, ['generated', 'generated date'], 4);
  var sentColumn = findCertificateColumn(headers, ['sent', 'sent date'], 5);
  var urlColumn = findCertificateColumn(
    headers, ['url', 'certificate url', 'certificate link', 'verification url'], 6
  );
  var statusColumn = findCertificateColumn(headers, ['status'], 7);
  var now = new Date();

  sheet.getRange(rowNumber, generatedColumn + 1).setValue(now);
  sheet.getRange(rowNumber, sentColumn + 1).setValue(now);
  sheet.getRange(rowNumber, urlColumn + 1).setValue(verifyUrl);
  sheet.getRange(rowNumber, statusColumn + 1).setValue('Sent');
}

function backfillCertificateVerificationUrls() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Certificates');
  if (!sheet) throw new Error('Certificates sheet was not found.');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;

  var headers = values[0];
  var codeColumn = findCertificateColumn(
    headers, ['code', 'certificate code', 'certificate id', 'access code'], 0
  );
  var urlColumn = findCertificateColumn(
    headers, ['url', 'certificate url', 'certificate link', 'verification url'], 6
  );
  var statusColumn = findCertificateColumn(headers, ['status'], 7);
  var updated = 0;

  for (var i = 1; i < values.length; i++) {
    var code = String(values[i][codeColumn] || '').trim().toUpperCase();
    var status = String(values[i][statusColumn] || '').trim().toUpperCase();
    if (code && status === 'SENT' && !String(values[i][urlColumn] || '').trim()) {
      sheet.getRange(i + 1, urlColumn + 1).setValue(
        'https://decrypt-certficate.vercel.app/verify.html?code=' + encodeURIComponent(code)
      );
      updated++;
    }
  }
  Logger.log('Backfilled verification URLs for ' + updated + ' sent certificate(s).');
  return updated;
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
    var certificatesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Certificates');
    if (certificatesSheet) {
      var certificateData = certificatesSheet.getDataRange().getValues();
      if (certificateData.length > 1) {
        var certificateHeaders = certificateData[0];
        var certificateCodeColumn = findCertificateColumn(
          certificateHeaders, ['code', 'certificate code', 'certificate id', 'access code'], 0
        );
        var certificateNameColumn = findCertificateColumn(
          certificateHeaders, ['name', 'participant name', 'full name'], 1
        );
        var certificateTrackColumn = findCertificateColumn(
          certificateHeaders, ['track', 'event track'], 3
        );
        var certificateStatusColumn = findCertificateColumn(certificateHeaders, ['status'], 7);

        for (var c = 1; c < certificateData.length; c++) {
          var certificateRow = certificateData[c];
          var certificateCode = String(certificateRow[certificateCodeColumn] || '').trim().toUpperCase();
          if (certificateCode === code &&
              String(certificateRow[certificateStatusColumn] || '').trim().toUpperCase() === 'SENT') {
            return jsonResponse({
              verified: true,
              name: certificateRow[certificateNameColumn] || '',
              track: certificateRow[certificateTrackColumn] || 'General',
              event: 'DECRYPT 2.0',
              date: 'October 2026',
              code: certificateCode
            });
          }
        }
      }
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
    if (!sheet) return jsonResponse({ verified: false, reason: 'not_found' });
    var data = sheet.getDataRange().getValues();
    if (!data.length) return jsonResponse({ verified: false, reason: 'not_found' });
    var headers = data[0];
    var codeColumn = findCertificateColumn(
      headers, ['code', 'access code', 'certificate code', 'certificate id'],
      typeof COL !== 'undefined' && COL.CODE != null ? COL.CODE : 0
    );
    var statusColumn = findCertificateColumn(
      headers, ['status', 'attendance status', 'check-in status'],
      typeof COL !== 'undefined' && COL.STATUS != null ? COL.STATUS : 0
    );
    var nameColumn = findCertificateColumn(
      headers, ['name', 'participant name', 'full name'],
      typeof COL !== 'undefined' && COL.NAME != null ? COL.NAME : 1
    );
    var trackColumn = findCertificateColumn(
      headers, ['track', 'event track'],
      typeof COL !== 'undefined' && COL.TRACK != null ? COL.TRACK : 3
    );

    for (var i = 1; i < data.length; i++) {
      var row     = data[i];
      var rowCode = String(row[codeColumn] || '').trim().toUpperCase();

      if (rowCode === code) {
        var checkedIn = String(row[statusColumn] || '').trim().toUpperCase() === 'CHECKED_IN';
        if (!checkedIn) {
          /* Registered but didn't attend — certificate not valid */
          return jsonResponse({ verified: false, reason: 'not_attended' });
        }
        return jsonResponse({
          verified:  true,
          name:      row[nameColumn]  || '',
          track:     row[trackColumn] || 'General',
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
// ROUTING IN Code.gs
//
// In the public routes section (no token needed):
//   if (action === 'verify_certificate') return handleVerifyCertificate(e);
//
// In ADMIN_ACTIONS in Admin.gs (token required):
//   'sendCertificateEmail': function(e) { return handleSendCertificateEmail(e); },
// The POST dispatcher must parse the JSON body to obtain its action before
// calling the admin action, then pass the original event to this handler.
// ---------------------------------------------------------------------------
