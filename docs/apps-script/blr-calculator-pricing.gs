/* =================================================================================================
 * EDIT K (2026-11-04): Google Form jobs priced with the dashboard's Quick estimate.
 * Repo copy of what is pasted into Matt's live script ("Find a Mover - Job Details (Responses)").
 *
 * 1. In onFormSubmitInstallable(), replace
 *        applyFirstBookingOffer_(data, values, moveDateRaw, tz);
 *    with
 *        // EDIT K (2026-11-04): Quick estimate jobs are priced by the website's engine; others as before.
 *        if (!applyCalculatorPricing_(data, values, moveDateRaw, tz)) applyFirstBookingOffer_(data, values, moveDateRaw, tz);
 *
 * 2. Append the block below at the end of Code.gs.
 *
 * Matt's other quotes (the new questions left blank) are made exactly as before, from the Calc tab.
 * ================================================================================================= */

/**
 * A job filled from the dashboard's Quick estimate answers "Long carry ends (0-2)" and "Heavy items
 * count" (Fill form always does). Its form holds prices BEFORE discount. Here the first-booking
 * decision is made once (the same rule as applyFirstBookingOffer_), then the website prices the job
 * with the chat's own engine (/api/intake "priceQuote") and sends back the PDF lines: Moving Labour
 * (the rounding to $10 folded in), Stair Carry Fee, Long Carry Fee, Heavy Items, the 10% once,
 * Subtotal, GST, Total. $0 lines stay hidden. Returns false -- and the quote is made the old way,
 * from the Calc tab -- when it isn't such a job or the website can't price it.
 */
function applyCalculatorPricing_(data, values, moveDateRaw, tz, opts) {
  var longCarry = String(getVal_(data, 'Long carry ends') || '').trim();
  var heavy = String(getVal_(data, 'Heavy items count') || '').trim();
  if (longCarry === '' && heavy === '') return false;
  try {
    var number = function (v) { return Number(String(v || '').replace(/[^0-9.]/g, '')) || 0; };
    var truck = String(getVal_(data, 'Truck size') || '').trim();
    var movers = parseInt(String(getVal_(data, 'Crew') || ''), 10);
    var hours = number(getVal_(data, 'Est. hours'));
    if (!truck || !movers || !hours) {
      Logger.log('Calculator pricing: truck, crew or hours missing -- the quote goes the old way');
      return false;
    }
    var check = checkCustomerWithWebsite_(data, values, moveDateRaw, tz);
    var override = String(getVal_(data, 'First-booking offer') || '');
    var source = String(getVal_(data, 'Source') || '');
    var decision = firstBookingOfferDecision_(check, override, source);
    var priced = postToIntake_({
      action: 'priceQuote',
      truck: truck,
      movers: movers,
      hours: hours,
      rateHr: number(getVal_(data, 'Rate')) || undefined,
      stairFlights: number(getVal_(data, 'Stair Flights')),
      longCarryEnds: number(longCarry),
      heavyItems: number(heavy),
      newCustomer: Boolean(decision.give)
    });
    if (!priced || !priced.ok || !priced.values) {
      Logger.log('Calculator pricing: website said %s -- the quote goes the old way', JSON.stringify(priced));
      return false;
    }
    var before = values.Total;
    Object.keys(priced.values).forEach(function (k) { values[k] = priced.values[k]; });
    values.Discount = Number(priced.discount) ? String(priced.discount) : '';
    values.DiscountPercent = String(priced.discountPercent || '');
    Logger.log('Calculator pricing: %s -- total %s (%s)', decision.customerType, values.Total, decision.give ? 'discount ' + values.Discount : 'no discount');
    if (!(opts && opts.quiet)) {
      logFirstBookingOffer_(values, source, override, decision, before);
      sendOfferNotice_(values, decision);
    }
    return true;
  } catch (err) {
    Logger.log('Calculator pricing failed -- the quote goes the old way: ' + err);
    return false;
  }
}

/** POST to the website's /api/intake with the shared secret; the parsed JSON, or null. */
function postToIntake_(body) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('BLR_INTAKE_URL');
  var secret = props.getProperty('BLR_SHARED_SECRET');
  if (!url || !secret) return null;
  var headers = { 'x-blr-secret': secret };
  var bypass = props.getProperty('BLR_VERCEL_BYPASS');
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: headers, payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log('Intake %s: HTTP %s %s', body.action, res.getResponseCode(), res.getContentText().slice(0, 200));
    return null;
  }
  return JSON.parse(res.getContentText());
}

/** EDIT K test (Run in the editor): prices a sample Quick estimate job, logs its PDF lines. No email, no sheet rows. */
function testCalculatorPricing() {
  var data = {
    'Customer Email :': 'nobody-new@example.com', 'Rate p/h :': '130', 'Crew :': '2 movers', 'Est. hours :': '3.7667',
    'No.of Stair Flights': '3', 'Source': 'Phone', 'Truck size': '4.5T', 'Long carry ends (0-2)': '2', 'Heavy items count': '1'
  };
  var values = { Email: 'nobody-new@example.com', Contact: '', BookingNo: 'TEST-CALC', Total: '0.00' };
  var ok = applyCalculatorPricing_(data, values, '', Session.getScriptTimeZone(), { quiet: true });
  // Expect: true, Total 760.00, ExtraRows = Long Carry Fee, Heavy Items, ONE "New customer discount (10%)"
  Logger.log('%s Total %s Labour %s Stair %s Subtotal %s GST %s ExtraRows %s', ok, values.Total, values.Labour, values.Stair, values.Subtotal, values.GST, JSON.stringify(values.ExtraRows));
}
