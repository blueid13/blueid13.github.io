/**
 * ECG Review Google Apps Script backend
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Set SECRET below if you want simple write protection.
 * 5. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone with the link
 * 6. Copy the Web app URL into the review site's main page.
 */

const SHEET_NAME = 'responses';
const SECRET = ''; // Optional. If non-empty, incoming payload.token must match this value.

const HEADERS = [
  'server_timestamp',
  'client_timestamp',
  'reviewer_id',
  'session_id',
  'disease_group',
  'case_id',
  'image_path',
  'verdict',
  'observed_labels',
  'reasons',
  'comment',
  'elapsed_ms',
  'app_version',
  'user_agent',
  'payload_json'
];

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'ECG review endpoint is running.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);

    if (SECRET && payload.token !== SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    sheet.appendRow([
      new Date(),
      payload.client_timestamp || '',
      payload.reviewer_id || '',
      payload.session_id || '',
      payload.disease_group || '',
      payload.case_id || '',
      payload.image_path || '',
      payload.verdict || '',
      arr_(payload.observed_labels),
      arr_(payload.reasons),
      payload.comment || '',
      payload.elapsed_ms || '',
      payload.app_version || '',
      payload.user_agent || '',
      JSON.stringify(payload)
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  return {};
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const missing = HEADERS.some((h, i) => current[i] !== h);
  if (missing) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function arr_(value) {
  if (Array.isArray(value)) return value.join(';');
  return value || '';
}
