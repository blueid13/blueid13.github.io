/**
 * ECG Review Google Apps Script backend - simplified version
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone with the link
 * 5. Copy the Web app URL into config.js as APPS_SCRIPT_URL.
 */

const SHEET_NAME = 'responses';

const HEADERS = [
  'response_key',
  'server_timestamp',
  'client_timestamp',
  'session_id',
  'disease_group',
  'case_id',
  'image_path',
  'verdict',
  'observed_labels',
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
    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    const key = payload.response_key || [payload.disease_group || '', payload.case_id || ''].join('__');
    const row = [
      key,
      new Date(),
      payload.client_timestamp || '',
      payload.session_id || '',
      payload.disease_group || '',
      payload.case_id || '',
      payload.image_path || '',
      payload.verdict || '',
      arr_(payload.observed_labels),
      payload.comment || '',
      payload.elapsed_ms || '',
      payload.app_version || '',
      payload.user_agent || '',
      JSON.stringify(payload)
    ];

    const existingRow = findRowByKey_(sheet, key);
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

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

function findRowByKey_(sheet, key) {
  if (!key) return -1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === key) return i + 2;
  }
  return -1;
}

function arr_(value) {
  if (Array.isArray(value)) return value.join(';');
  return value || '';
}
