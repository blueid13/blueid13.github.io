const CONFIG = window.ECG_REVIEW_CONFIG || {};
const APP_VERSION = CONFIG.APP_VERSION || "1.1.0-simple";
const STORAGE_KEY = "ecg_review_responses_v2_simple";
const SESSION_KEY = "ecg_review_session_id_v2_simple";

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

function readAllResponses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function writeAllResponses(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function responseKey(group, caseId) { return `${group}__${caseId}`; }
function getUrlParams() { return new URLSearchParams(window.location.search); }

function getScriptUrl() {
  const url = (CONFIG.APPS_SCRIPT_URL || "").trim();
  if (!url || url.includes("PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) return "";
  return url;
}

async function loadManifest() {
  const res = await fetch("manifest.json", { cache: "no-store" });
  manifest = await res.json();
  return manifest;
}

function setupHome() {
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
  `).join("");
}

function setupReview() {
  const params = getUrlParams();
  const group = params.get("group") || "AMI";
  cases = manifest.cases.filter(c => c.group === group);

  if (!cases.length) {
    $("caseLabel").textContent = "No cases";
    updateStatus("케이스 없음", "warn");
    return;
  }

  const startCase = params.get("case");
  if (startCase) {
    const idx = cases.findIndex(c => c.case_id === startCase);
    if (idx >= 0) currentIndex = idx;
  }

  document.querySelectorAll("input[name='verdict'], input[name='observed']").forEach(el => {
    el.addEventListener("change", () => scheduleSaveAndSend());
  });
  $("commentInput").addEventListener("input", () => scheduleSaveAndSend());
  $("saveBtn").addEventListener("click", () => saveAndSend(true));
  $("prevBtn").addEventListener("click", () => moveCase(-1));
  $("nextBtn").addEventListener("click", () => moveCase(1));
  document.addEventListener("keydown", handleKeydown);
  renderCase();
}

function getCurrentCase() { return cases[currentIndex]; }

function collectForm() {
  const verdict = document.querySelector("input[name='verdict']:checked")?.value || "";
  const observed = [...document.querySelectorAll("input[name='observed']:checked")].map(x => x.value);
  const comment = $("commentInput").value.trim();
  const c = getCurrentCase();
  const key = responseKey(c.group, c.case_id);

  return {
    response_key: key,
    client_timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    disease_group: c.group,
    case_id: c.case_id,
    image_path: c.path,
    verdict,
    observed_labels: observed,
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
  updateStatus(saved ? "저장됨" : "대기 중", saved ? "ok" : "neutral");
}

function updateStatus(text, tone = "ok") {
  const el = $("saveStatus");
  el.textContent = text;
  el.className = "status-pill" + (tone === "warn" ? " warn-pill" : tone === "neutral" ? " muted-pill" : "");
}

function scheduleSaveAndSend() {
  clearTimeout(saveTimer);
  updateStatus("입력 중...", "neutral");
  saveTimer = setTimeout(() => saveAndSend(false), 700);
}

async function saveAndSend(force) {
  clearTimeout(saveTimer);
  const payload = collectForm();
  const all = readAllResponses();
  all[payload.response_key] = payload;
  writeAllResponses(all);
  updateStatus("저장 중...", "neutral");
  await sendToSheets(payload, force);
}

async function sendToSheets(payload, force = false) {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    updateStatus("Sheets URL 미설정", "warn");
    return;
  }

  try {
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
      keepalive: true,
    });
    updateStatus("Sheets 전송 시도됨", "ok");
  } catch (err) {
    console.error(err);
    updateStatus("Sheets 전송 실패", "warn");
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
  try {
    await loadManifest();
    if (document.body.classList.contains("home-page")) setupHome();
    if (document.body.classList.contains("review-page")) setupReview();
  } catch (err) {
    console.error(err);
    const target = $("caseLabel") || document.querySelector("h1");
    if (target) target.textContent = "manifest.json 로딩 실패";
  }
})();
