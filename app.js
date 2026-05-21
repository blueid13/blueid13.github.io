const CONFIG = window.ECG_REVIEW_CONFIG || {};
const APP_VERSION = CONFIG.APP_VERSION || "1.0.0";
const STORAGE_KEY = "ecg_review_responses_v1";
const SETTINGS_KEY = "ecg_review_settings_v1";
const SESSION_KEY = "ecg_review_session_id_v1";

let manifest = null;
let cases = [];
let currentIndex = 0;
let startedAt = Date.now();
let saveTimer = null;

function $(id) { return document.getElementById(id); }

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readSettings() {
  const defaults = { reviewer_id: "", script_url: CONFIG.APPS_SCRIPT_URL || "", token: CONFIG.SHARED_SECRET || "" };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return defaults; }
}

function writeSettings(next) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...next }));
}

function readAllResponses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function writeAllResponses(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function responseKey(group, caseId) { return `${group}__${caseId}`; }

function getUrlParams() { return new URLSearchParams(window.location.search); }

async function loadManifest() {
  const res = await fetch("manifest.json", { cache: "no-store" });
  manifest = await res.json();
  return manifest;
}

function makeCSV(rows) {
  const headers = [
    "client_timestamp", "reviewer_id", "session_id", "disease_group", "case_id", "image_path",
    "verdict", "observed_labels", "reasons", "comment", "elapsed_ms", "app_version", "user_agent"
  ];
  const esc = (v) => {
    if (Array.isArray(v)) v = v.join(";");
    if (v === null || v === undefined) v = "";
    const s = String(v).replaceAll('"', '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportResponses(filterGroup = null) {
  const all = Object.values(readAllResponses());
  const rows = filterGroup && filterGroup !== "ALL" ? all.filter(r => r.disease_group === filterGroup) : all;
  const suffix = filterGroup ? filterGroup : "ALL";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadText(`ecg_review_${suffix}_${stamp}.csv`, makeCSV(rows));
}

function setupHome() {
  const settings = readSettings();
  const reviewerInput = $("reviewerInput");
  const scriptUrlInput = $("scriptUrlInput");
  const tokenInput = $("tokenInput");
  reviewerInput.value = settings.reviewer_id || "";
  scriptUrlInput.value = settings.script_url || "";
  tokenInput.value = settings.token || "";
  reviewerInput.addEventListener("input", e => writeSettings({ reviewer_id: e.target.value.trim() }));
  scriptUrlInput.addEventListener("input", e => writeSettings({ script_url: e.target.value.trim() }));
  tokenInput.addEventListener("input", e => writeSettings({ token: e.target.value }));

  const cards = $("groupCards");
  const counts = manifest.counts || {};
  const groups = ["AMI", "IMI", "LMI"];
  cards.innerHTML = groups.map(g => `
    <a class="group-card" href="review.html?group=${encodeURIComponent(g)}">
      <div>
        <h3>${g}</h3>
        <p>${g} 후보군을 순서대로 검증합니다.</p>
      </div>
      <span class="count-badge">${counts[g] || 0} cases</span>
    </a>
  `).join("") + `
    <a class="group-card" href="review.html?group=ALL&shuffle=1">
      <div>
        <h3>ALL</h3>
        <p>전체 케이스를 섞어서 봅니다.</p>
      </div>
      <span class="count-badge">${manifest.cases.length} cases</span>
    </a>
  `;

  $("exportAllBtn").addEventListener("click", () => exportResponses(null));
  $("clearLocalBtn").addEventListener("click", () => {
    const ok = confirm("현재 브라우저에 저장된 검증 응답을 모두 삭제할까요? Google Sheets에 이미 전송된 행은 삭제되지 않습니다.");
    if (ok) {
      localStorage.removeItem(STORAGE_KEY);
      alert("로컬 저장값을 초기화했습니다.");
    }
  });
}

function stableShuffle(arr) {
  const copy = [...arr];
  let seed = 20260521;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setupReview() {
  const params = getUrlParams();
  const group = params.get("group") || "AMI";
  const shuffle = params.get("shuffle") === "1";
  cases = group === "ALL" ? [...manifest.cases] : manifest.cases.filter(c => c.group === group);
  if (shuffle) cases = stableShuffle(cases);
  if (!cases.length) {
    $("caseLabel").textContent = "No cases";
    return;
  }
  const startCase = params.get("case");
  if (startCase) {
    const idx = cases.findIndex(c => c.case_id === startCase);
    if (idx >= 0) currentIndex = idx;
  }

  document.querySelectorAll("input[name='verdict'], input[name='observed'], input[name='reason']").forEach(el => {
    el.addEventListener("change", () => scheduleSaveAndSend());
  });
  $("commentInput").addEventListener("input", () => scheduleSaveAndSend());
  $("saveBtn").addEventListener("click", () => saveAndSend(true));
  $("prevBtn").addEventListener("click", () => moveCase(-1));
  $("nextBtn").addEventListener("click", () => moveCase(1));
  $("exportGroupBtn").addEventListener("click", () => exportResponses(group));
  document.addEventListener("keydown", handleKeydown);
  renderCase();
}

function getCurrentCase() { return cases[currentIndex]; }

function collectForm() {
  const verdict = document.querySelector("input[name='verdict']:checked")?.value || "";
  const observed = [...document.querySelectorAll("input[name='observed']:checked")].map(x => x.value);
  const reasons = [...document.querySelectorAll("input[name='reason']:checked")].map(x => x.value);
  const comment = $("commentInput").value.trim();
  const c = getCurrentCase();
  const settings = readSettings();
  return {
    client_timestamp: new Date().toISOString(),
    reviewer_id: settings.reviewer_id || "",
    session_id: getSessionId(),
    disease_group: c.group,
    case_id: c.case_id,
    image_path: c.path,
    verdict,
    observed_labels: observed,
    reasons,
    comment,
    elapsed_ms: Date.now() - startedAt,
    app_version: APP_VERSION,
    user_agent: navigator.userAgent,
  };
}

function setFormFromResponse(resp) {
  document.querySelectorAll("input[name='verdict']").forEach(el => el.checked = resp?.verdict === el.value);
  const observed = new Set(resp?.observed_labels || []);
  document.querySelectorAll("input[name='observed']").forEach(el => el.checked = observed.has(el.value));
  const reasons = new Set(resp?.reasons || []);
  document.querySelectorAll("input[name='reason']").forEach(el => el.checked = reasons.has(el.value));
  $("commentInput").value = resp?.comment || "";
}

function renderCase() {
  startedAt = Date.now();
  const c = getCurrentCase();
  $("caseLabel").textContent = `${c.group}_${c.case_id}`;
  $("progressLabel").textContent = `${currentIndex + 1} / ${cases.length}`;
  $("ecgImage").src = encodeURI(c.path);
  $("ecgImage").alt = `${c.group}_${c.case_id} 12-lead ECG`;
  $("prevBtn").disabled = currentIndex === 0;
  $("nextBtn").disabled = currentIndex === cases.length - 1;

  const saved = readAllResponses()[responseKey(c.group, c.case_id)];
  setFormFromResponse(saved);
  updateStatus(saved ? "로컬 저장됨" : "대기 중", saved ? "ok" : "neutral");
  updateSyncStatus();
}

function updateStatus(text, tone = "ok") {
  const el = $("saveStatus");
  el.textContent = text;
  el.className = "status-pill" + (tone === "warn" ? " warn-pill" : tone === "neutral" ? " muted-pill" : "");
}

function updateSyncStatus(text = null, tone = "neutral") {
  const settings = readSettings();
  const el = $("syncStatus");
  if (!text) text = settings.script_url ? "Sheets 전송 준비" : "Sheets 미연동";
  el.textContent = text;
  el.className = "status-pill" + (tone === "warn" ? " warn-pill" : tone === "ok" ? "" : " muted-pill");
}

function scheduleSaveAndSend() {
  clearTimeout(saveTimer);
  updateStatus("입력 중...", "neutral");
  saveTimer = setTimeout(() => saveAndSend(false), 900);
}

async function saveAndSend(force) {
  clearTimeout(saveTimer);
  const payload = collectForm();
  const all = readAllResponses();
  all[responseKey(payload.disease_group, payload.case_id)] = payload;
  writeAllResponses(all);
  updateStatus("로컬 저장됨", "ok");
  await sendToSheets(payload, force);
}

async function sendToSheets(payload, force = false) {
  const settings = readSettings();
  const urlToken = getUrlParams().get("token") || "";
  const token = settings.token || urlToken || CONFIG.SHARED_SECRET || "";
  const scriptUrl = settings.script_url || CONFIG.APPS_SCRIPT_URL || "";
  if (!scriptUrl) {
    updateSyncStatus("Sheets 미연동", "neutral");
    return;
  }
  const body = { ...payload, token };
  try {
    updateSyncStatus("Sheets 전송 중...", "neutral");
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(body),
      keepalive: true,
    });
    updateSyncStatus("Sheets 전송 시도 완료", "ok");
  } catch (err) {
    console.error(err);
    updateSyncStatus("Sheets 전송 실패 - CSV 백업 필요", "warn");
  }
}

function moveCase(delta) {
  saveAndSend(false);
  const next = currentIndex + delta;
  if (next < 0 || next >= cases.length) return;
  currentIndex = next;
  renderCase();
}

function handleKeydown(e) {
  if (e.target && ["TEXTAREA", "INPUT"].includes(e.target.tagName) && !(e.ctrlKey || e.metaKey)) return;
  if (e.key === "ArrowLeft") moveCase(-1);
  if (e.key === "ArrowRight") moveCase(1);
  if (e.key === "1") checkVerdict("match");
  if (e.key === "2") checkVerdict("mismatch");
  if (e.key === "3") checkVerdict("uncertain");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveAndSend(true);
  }
}

function checkVerdict(value) {
  const el = document.querySelector(`input[name='verdict'][value='${value}']`);
  if (el) {
    el.checked = true;
    scheduleSaveAndSend();
  }
}

(async function init() {
  await loadManifest();
  if (document.body.classList.contains("home-page")) setupHome();
  if (document.body.classList.contains("review-page")) setupReview();
})();
