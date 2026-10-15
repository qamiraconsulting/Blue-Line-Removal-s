/**
 * BLR quote Apps Script -- WEBSITE ADDITIONS (2026-10-15)
 * ------------------------------------------------------
 * Adds two things to the existing "Find a Mover: Auto Quote Generator" script, without
 * changing how Matt's quotes work:
 *
 *   1. doPost()               -- the website (chat + quote form) asks this script to make the SAME
 *                                branded PDF from the SAME Drive template and email it from
 *                                hello@bluelineremovals.com.au, when the team sends a quote or
 *                                confirms a booking on the dashboard.
 *   2. sendRowToWebsite_()    -- after Matt's quote email has gone, copies the Google Form row to
 *                                the website's database, so his quotes and bookings show on the
 *                                dashboard and block the truck in the booking calendar.
 *
 * Paste EVERYTHING BELOW the line "PASTE FROM HERE" at the bottom of Code.gs, then make the
 * four small edits to the existing code listed here:
 *
 *   EDIT A  -- in onFormSubmitInstallable(), in the `values` object, after the line
 *                Stair: money(getVal_(calc, 'Stair Carry')),
 *              add:
 *                Adjustment: '0.00',
 *
 *   EDIT B  -- in onFormSubmitInstallable(), replace
 *                createQuoteDraft_(values, pdfBlob);
 *              with
 *                createQuoteDraft_(values, pdfBlob);
 *                sendRowToWebsite_(data, values, moveDateRaw, tz);
 *
 *   EDIT C  -- in buildQuotePdf_(), after the line
 *                styleEstimateTable_(tempBody);
 *              add:
 *                removeZeroAdjustmentRow_(tempBody);
 *
 *   EDIT D  -- replace the whole createQuoteDraft_() function with the version below
 *              (createQuoteDraft_ in this file). Same behaviour for Matt's quotes; the website
 *              can pass its own recipient, subject and a short intro (e.g. the team's note).
 *
 *   TEMPLATE -- in BLR_Quote_Template.html (Drive), in the "YOUR ESTIMATE" table, copy the
 *              Packing row, change its label to "Discount / adjustment" and {{Packing}} to
 *              {{Adjustment}}. The row is removed automatically from PDFs where it's 0.00.
 *
 * SCRIPT PROPERTIES (Project Settings > Script Properties) -- never put these in the code:
 *   BLR_SHARED_SECRET   the long random password (same value as APPS_SCRIPT_SECRET in Vercel)
 *   BLR_INTAKE_URL      https://<site>/api/intake
 *   BLR_VERCEL_BYPASS   only while testing on the Vercel preview link: the "Protection Bypass
 *                       for Automation" secret (Vercel > Settings > Deployment Protection)
 *
 * DEPLOY doPost: Deploy > New deployment > type "Web app" > Execute as: Me > Who has access:
 * Anyone > Deploy. Copy the ".../exec" URL into Vercel as APPS_SCRIPT_URL. The secret check in
 * doPost is what keeps it private. After editing the code later: Deploy > Manage deployments >
 * edit (pencil) > Version: New version -- the URL stays the same.
 */

// ===================================================================== PASTE FROM HERE

/**
 * The website asks for a branded PDF quote to be made and emailed.
 * Body (JSON): { secret, action: "sendQuote", to, subject, introHtml, introText, values: {...} }
 * `values` uses the template's own placeholder names (CustomerName, BookingNo, Total, ...).
 */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('BLR_SHARED_SECRET');
    if (!secret || body.secret !== secret) {
      out = { ok: false, error: 'not allowed' };
    } else if (body.action !== 'sendQuote' || !body.values || !body.to) {
      out = { ok: false, error: 'bad request' };
    } else {
      var pdfBlob = buildQuotePdf_(body.values, body.values.CustomerName);
      createQuoteDraft_(body.values, pdfBlob, {
        to: body.to,
        subject: body.subject,
        introHtml: body.introHtml,
        introText: body.introText
      });
      out = { ok: true };
    }
  } catch (err) {
    Logger.log('doPost error: ' + err);
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * EDIT D: replaces the existing createQuoteDraft_(). Matt's quotes call it with two arguments
 * and behave exactly as before; the website passes `opts` (recipient, subject, intro).
 */
function createQuoteDraft_(values, pdfBlob, opts) {
  opts = opts || {};
  var htmlTemplate = DriveApp.getFileById(CONFIG.EMAIL_TEMPLATE_FILE_ID).getBlob().getDataAsString();

  var html = htmlTemplate;
  Object.keys(values).forEach(function (key) {
    var re = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
    html = html.replace(re, String(values[key] != null ? values[key] : ''));
  });

  // The website's short intro (what this email is, and the team's note) goes at the top.
  if (opts.introHtml) {
    var block = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c2733;padding:16px 20px;border-left:4px solid #ff6b1a;background:#fff7f1;margin:0 0 12px">' + opts.introHtml + '</div>';
    html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, function (m) { return m + block; }) : block + html;
  }

  var headerBlob = DriveApp.getFileById(CONFIG.EMAIL_HEADER_IMAGE_ID).getBlob();
  var newhomeBlob = DriveApp.getFileById(CONFIG.EMAIL_NEWHOME_IMAGE_ID).getBlob();

  var plainBody = 'Hi ' + values.CustomerName + ',\n\n' +
    (opts.introText ? opts.introText + '\n\n' : '') +
    'Thanks for getting in touch with Blue Line Removals. Your quote is attached as a PDF.\n\n' +
    'Estimated Total: A$' + values.Total + ' AUD\n\n' +
    'Warm regards,\nAlisha Carter\nCustomer Care Team, Blue Line Removals';

  GmailApp.sendEmail(opts.to || values.Email, opts.subject || CONFIG.EMAIL_SUBJECT, plainBody, {
    htmlBody: html,
    from: CONFIG.SEND_FROM,
    replyTo: CONFIG.REPLY_TO,
    attachments: [pdfBlob],
    inlineImages: {
      blr_header: headerBlob,
      blr_newhome: newhomeBlob
    }
  });
}

/**
 * EDIT B calls this after Matt's quote email has gone: copies the row to the website so the job
 * shows on the dashboard (and, when Booking Status is Confirmed, blocks the truck in the
 * calendar). It never throws -- if the website is down, Matt's quote has still been sent.
 */
function sendRowToWebsite_(data, values, moveDateRaw, tz) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('BLR_INTAKE_URL');
    var secret = props.getProperty('BLR_SHARED_SECRET');
    if (!url || !secret) return;

    var arrivalRaw = getVal_(data, 'Arrival time');
    var arrival = (arrivalRaw instanceof Date) ? Utilities.formatDate(arrivalRaw, tz, 'HH:mm') : String(arrivalRaw || '').trim();
    var moveIso = (moveDateRaw instanceof Date) ? Utilities.formatDate(moveDateRaw, tz, 'yyyy-MM-dd') : '';

    // Dates in the row as readable text (the website matches columns by header words).
    var plain = {};
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      plain[k] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : v;
    });

    var headers = { 'x-blr-secret': secret };
    var bypass = props.getProperty('BLR_VERCEL_BYPASS');
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({ data: plain, values: values, moveDateIso: moveIso, arrivalTime: arrival }),
      muteHttpExceptions: true
    });
    Logger.log('Website intake: HTTP %s %s', res.getResponseCode(), res.getContentText().slice(0, 300));
  } catch (err) {
    Logger.log('Website intake failed (the quote email was still sent): ' + err);
  }
}

/** EDIT C: drops the "Discount / adjustment" row from the estimate table when it's 0.00. */
function removeZeroAdjustmentRow_(body) {
  collect_(body, DocumentApp.ElementType.TABLE).forEach(function (t) {
    t = t.asTable();
    if (t.getRow(0).getText().indexOf('Amount (AUD)') === -1) return;
    for (var r = t.getNumRows() - 1; r > 0; r--) {
      var text = t.getRow(r).getText();
      if (/adjustment/i.test(text) && /(^|[^\d])0\.00\s*$/.test(text.trim())) t.removeRow(r);
    }
  });
}

/**
 * Optional check from the editor (select testWebsiteQuote, click Run): makes a sample PDF and emails it to
 * YOUR address, exactly as the website would. Change the address first.
 */
function testWebsiteQuote() {
  var secret = PropertiesService.getScriptProperties().getProperty('BLR_SHARED_SECRET');
  var sample = {
    secret: secret,
    action: 'sendQuote',
    to: 'YOUR-EMAIL@example.com',
    subject: '[TEST] Your move is booked (ref BLR-20261015-TEST01)',
    introText: 'TEST -- this is how a website booking confirmation looks.',
    introHtml: '<p style="margin:0">TEST -- this is how a website booking confirmation looks.</p>',
    values: {
      CustomerName: 'Test Customer', Email: 'test@example.com', Contact: '0400 000 000',
      MoveDate: 'Wednesday, 21 October 2026, arrival 7:30am', Pickup: 'Preston', Delivery: 'Brunswick',
      Services: 'Standard Move', Crew: '2 movers, 6-8 tonne truck', BookingStatus: 'Confirmed',
      StatusColor: '#15803D', BookingNo: 'BLR-20261015-TEST01', StairFlights: '0', Hours: '4.5',
      RateHr: '140.00', DaysUntilMove: '6', Labour: '630.00', CallOut: '0.00', Packing: '0.00',
      Stair: '0.00', Adjustment: '24.55', Subtotal: '654.55', GST: '65.45', Total: '720.00'
    }
  };
  var res = doPost({ postData: { contents: JSON.stringify(sample) } });
  Logger.log(res.getContent());
}
