/**
 * BLR quote Apps Script -- 10% FIRST-BOOKING OFFER (2026-10-25)
 * ------------------------------------------------------------
 * The website promises "10% off your first booking". This takes the 10% off Matt's quotes
 * automatically for NEW customers, before the PDF is made:
 *
 *   1. Asks the website (same /api/intake address and secret as sendRowToWebsite_) whether this
 *      email or phone has had a booked or completed move with Blue Line before.
 *   2. Decides: Matt's "First-booking offer" answer wins (Give 10% / No discount); otherwise no
 *      discount on Airtasker / Moval jobs (platform price); otherwise NEW = 10% off, RETURNING =
 *      no discount. If the website can't be reached, the 10% is given and marked "Not checked".
 *   3. Takes 10% off the subtotal (labour + call-out + packing + stairs), then GST on the lower
 *      amount -- the quote PDF gets a "New customer discount (10%)" line under Packing, the email
 *      gets a short welcome line, and the job is saved to the website with the discount.
 *   4. Writes one line per quote to the "First-booking offer" tab (created on first use), so Matt
 *      can see New / Returning and the discount. Optionally emails him a one-line note.
 *
 * Paste EVERYTHING BELOW "PASTE FROM HERE" at the bottom of Code.gs, then make these edits:
 *
 *   EDIT E  -- in onFormSubmitInstallable(), replace
 *                var pdfBlob = buildQuotePdf_(values, data['Customer Name']);
 *                createQuoteDraft_(values, pdfBlob);
 *              with
 *                applyFirstBookingOffer_(data, values, moveDateRaw, tz);
 *                var pdfBlob = buildQuotePdf_(values, data['Customer Name']);
 *                createQuoteDraft_(values, pdfBlob, offerEmailOpts_(values));
 *
 *   EDIT F  -- DELETE the existing addAdjustmentRow_() function (the version in this file
 *              replaces it: same behaviour, plus its own label and a minus sign for discounts).
 *
 *   EDIT G  -- in resendLastRowToWebsite(), replace
 *                sendRowToWebsite_(data, values, getVal_(data, 'Requested date'), tz);
 *              with
 *                applyFirstBookingOffer_(data, values, getVal_(data, 'Requested date'), tz, { quiet: true });
 *                sendRowToWebsite_(data, values, getVal_(data, 'Requested date'), tz);
 *
 * GOOGLE FORM -- add one optional question (multiple choice), titled exactly:
 *     First-booking offer
 *   with the options:  Automatic  /  Give 10%  /  No discount
 *   Leaving it blank = Automatic. (The title avoids the words the script's lookups use:
 *   Rate, Email, Crew, Services, date.)
 *
 * OPTIONAL SCRIPT PROPERTY:
 *   BLR_OFFER_NOTICE_TO   an email address (e.g. Matt's) that gets a one-line note per quote:
 *                         "BLR25102615 -- Jane Smith: NEW customer, 10% (A$53.00) taken off".
 *                         Not set = no note (the tab still records everything).
 *
 * After pasting: run testFirstBookingOffer() once from the editor (it only logs, sends nothing).
 */

// ===================================================================== PASTE FROM HERE

var FIRST_BOOKING_OFFER = {
  PERCENT: 10,                       // used only if the website doesn't say (it reads the rate card)
  LOG_SHEET: 'First-booking offer',
  LOG_HEADERS: ['Logged at', 'Booking No', 'Customer', 'Email', 'Phone', 'Source', "Matt's choice",
    'Customer type', 'Previous move', 'Discount (AUD)', 'Total before (AUD)', 'Total after (AUD)', 'Note']
};

/**
 * EDIT E calls this before the PDF is made. Changes values in place when the discount applies
 * (Subtotal, GST, Total, plus Discount / Adjustment / AdjustmentLabel for the PDF line and the
 * website). Never throws -- if anything goes wrong, Matt's quote still goes out.
 */
function applyFirstBookingOffer_(data, values, moveDateRaw, tz, opts) {
  opts = opts || {};
  try {
    var override = String(getVal_(data, 'First-booking offer') || '');
    var source = String(getVal_(data, 'Source') || '');
    var check = checkCustomerWithWebsite_(data, values, moveDateRaw, tz);
    var decision = firstBookingOfferDecision_(check, override, source);
    var before = values.Total;

    if (decision.give) {
      var percent = (check && check.discountPercent) || FIRST_BOOKING_OFFER.PERCENT;
      var f = discountedFigures_(values.Subtotal, values.GST, percent);
      values.Discount = f.discount;
      values.Adjustment = '-' + f.discount;
      values.AdjustmentLabel = 'New customer discount (' + percent + '%)';
      values.DiscountPercent = String(percent);
      values.Subtotal = f.subtotal;
      values.GST = f.gst;
      values.Total = f.total;
    }
    Logger.log('First-booking offer: %s -- %s (%s)', decision.customerType, decision.give ? 'discount ' + values.Discount : 'no discount', decision.note);

    if (opts.quiet) return;
    logFirstBookingOffer_(values, source, override, decision, before);
    sendOfferNotice_(values, decision);
  } catch (err) {
    Logger.log('First-booking offer failed (quote sent without it): ' + err);
  }
}

/** Asks the website whether this customer has moved with Blue Line before. Null = couldn't check. */
function checkCustomerWithWebsite_(data, values, moveDateRaw, tz) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('BLR_INTAKE_URL');
    var secret = props.getProperty('BLR_SHARED_SECRET');
    if (!url || !secret) return null;

    var headers = { 'x-blr-secret': secret };
    var bypass = props.getProperty('BLR_VERCEL_BYPASS');
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({
        action: 'customerCheck',
        email: String(values.Email || ''),
        phone: String(values.Contact || ''),
        bookingNo: String(values.BookingNo || ''),
        linkedReference: String(getVal_(data, 'Website or chat reference') || ''),
        moveDateIso: (moveDateRaw instanceof Date) ? Utilities.formatDate(moveDateRaw, tz, 'yyyy-MM-dd') : ''
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      Logger.log('Customer check: HTTP %s %s', res.getResponseCode(), res.getContentText().slice(0, 200));
      return null;
    }
    var json = JSON.parse(res.getContentText());
    return json && json.ok ? json : null;
  } catch (err) {
    Logger.log('Customer check failed: ' + err);
    return null;
  }
}

/**
 * Who gets the 10%. check = the website's answer (null = couldn't check), override = Matt's
 * "First-booking offer" answer, source = the form's Source answer.
 */
function firstBookingOfferDecision_(check, override, source) {
  var o = String(override || '').toLowerCase();
  var type = !check ? 'Not checked' : (check.customerType === 'returning' ? 'Returning' : 'New');
  var prev = check && check.previousMove ? previousMoveText_(check.previousMove) : '';

  if (o.indexOf('no discount') !== -1) return { give: false, customerType: type, previous: prev, note: 'Matt chose No discount' };
  if (o.indexOf('give') !== -1) return { give: true, customerType: type, previous: prev, note: 'Matt chose Give 10%' };
  if (/airtasker|moval/i.test(String(source || ''))) {
    return { give: false, customerType: type, previous: prev, note: 'Platform job (' + source + ') -- platform price, no discount' };
  }
  if (!check) return { give: true, customerType: type, previous: '', note: "Couldn't reach the website to check -- 10% given, please check this customer" };
  if (type === 'Returning') return { give: false, customerType: type, previous: prev, note: 'Moved with us before -- no discount' };
  return { give: true, customerType: type, previous: '', note: 'First booking with Blue Line' };
}

/** 10% off the subtotal, then GST at the sheet's own rate on the lower amount. Strings, 2 decimals. */
function discountedFigures_(subtotal, gst, percent) {
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var sub = Number(subtotal) || 0;
  var gstRate = sub > 0 ? Math.round((Number(gst) || 0) / sub * 10000) / 10000 : 0.1;
  var discount = round2(sub * percent / 100);
  var newSub = round2(sub - discount);
  var newGst = round2(newSub * gstRate);
  return { discount: discount.toFixed(2), subtotal: newSub.toFixed(2), gst: newGst.toFixed(2), total: round2(newSub + newGst).toFixed(2) };
}

/** "BLR16102614 on 19 Oct 2026" */
function previousMoveText_(m) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(m.movingDate || ''));
  return m.reference + (d ? ' on ' + Number(d[3]) + ' ' + months[Number(d[2]) - 1] + ' ' + d[1] : '');
}

/** EDIT E: the welcome line at the top of the quote email -- only when the discount was given. */
function offerEmailOpts_(values) {
  if (!Number(values.Discount)) return undefined;
  var text = 'Welcome to Blue Line Removals! As a first-time customer, ' + (values.DiscountPercent || FIRST_BOOKING_OFFER.PERCENT) +
    '% (A$' + values.Discount + ') has been taken off your estimate.';
  return { introHtml: text.replace(/(\d+% \(A\$[\d.]+\))/, '<strong>$1</strong>'), introText: text };
}

/** One line per quote on the "First-booking offer" tab (created with headers on first use). */
function logFirstBookingOffer_(values, source, override, decision, totalBefore) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(FIRST_BOOKING_OFFER.LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(FIRST_BOOKING_OFFER.LOG_SHEET);
      sheet.appendRow(FIRST_BOOKING_OFFER.LOG_HEADERS);
      sheet.getRange(1, 1, 1, FIRST_BOOKING_OFFER.LOG_HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date(), values.BookingNo, values.CustomerName, values.Email, String(values.Contact || ''), source,
      override || 'Automatic', decision.customerType, decision.previous || '',
      decision.give ? Number(values.Discount) : 0, Number(totalBefore), Number(values.Total), decision.note
    ]);
  } catch (err) {
    Logger.log('Could not write the First-booking offer tab: ' + err);
  }
}

/** Optional one-line note to Matt (Script Property BLR_OFFER_NOTICE_TO). */
function sendOfferNotice_(values, decision) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('BLR_OFFER_NOTICE_TO');
    if (!to) return;
    var what = decision.give
      ? decision.customerType.toUpperCase() + ' customer, ' + (values.DiscountPercent || FIRST_BOOKING_OFFER.PERCENT) + '% (A$' + values.Discount + ') taken off'
      : decision.customerType.toUpperCase() + ' customer, no discount';
    var line = values.BookingNo + ' -- ' + values.CustomerName + ': ' + what;
    var body = line + '\n\n' + decision.note + (decision.previous ? ' (' + decision.previous + ')' : '') +
      '\nEstimated total sent: A$' + values.Total +
      (decision.give ? '\n\nRemember: take the same ' + (values.DiscountPercent || FIRST_BOOKING_OFFER.PERCENT) + '% off the final bill on the day.' : '');
    GmailApp.sendEmail(to, 'Quote ' + line, body, { from: CONFIG.SEND_FROM });
  } catch (err) {
    Logger.log('Offer notice failed: ' + err);
  }
}

/**
 * EDIT F: replaces the old addAdjustmentRow_(). Adds a line under Packing in the estimate table
 * when there's an Adjustment -- labelled values.AdjustmentLabel ("New customer discount (10%)")
 * or "Discount / adjustment" as before, with a minus sign for a discount.
 */
function addAdjustmentRow_(body, values) {
  var amount = Number(values && values.Adjustment);
  if (!amount) return;
  collect_(body, DocumentApp.ElementType.TABLE).forEach(function (t) {
    t = t.asTable();
    if (t.getRow(0).getText().indexOf('Amount (AUD)') === -1) return;
    for (var r = 1; r < t.getNumRows(); r++) {
      var row = t.getRow(r);
      if (!/packing/i.test(row.getCell(0).getText())) continue;
      var copy = row.copy();
      var n = copy.getNumCells();
      copy.getCell(0).editAsText().setText(values.AdjustmentLabel || 'Discount / adjustment');
      for (var c = 1; c < n - 1; c++) copy.getCell(c).editAsText().setText('');
      var amountText = copy.getCell(n - 1).editAsText();
      amountText.setText(adjustmentAmountText_(amountText.getText(), values.Packing, values.Adjustment));
      t.insertTableRow(r + 1, copy);
      return;
    }
  });
}

/** The Packing cell's text ("$0.00") re-used for the adjustment: "−$53.00" for a discount. */
function adjustmentAmountText_(packingCellText, packing, adjustment) {
  var amount = Number(adjustment);
  var abs = Math.abs(amount).toFixed(2);
  var current = String(packingCellText || '');
  var p = String(packing);
  var text = current.indexOf(p) !== -1 ? current.replace(p, abs) : abs;
  return amount < 0 ? '−' + text : text;
}

/** Run from the editor after pasting: checks the sums and the website link. Logs only, sends nothing. */
function testFirstBookingOffer() {
  Logger.log(JSON.stringify(discountedFigures_('530.00', '53.00', 10)));   // expect 53.00 / 477.00 / 47.70 / 524.70
  Logger.log(adjustmentAmountText_('$0.00', '0.00', '-53.00'));              // expect −$53.00
  var check = checkCustomerWithWebsite_({}, { Email: 'nobody@example.com', Contact: '0400000000', BookingNo: 'TEST' }, '', 'Australia/Melbourne');
  Logger.log('Website check: ' + (check ? JSON.stringify(check) : 'NOT REACHED -- check BLR_INTAKE_URL / BLR_SHARED_SECRET'));
}
