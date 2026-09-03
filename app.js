/* ============================================================
   Mentor · 수능 멘토링 플랫폼 - 메인 로직
   ============================================================ */

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
const EMAIL_DOMAIN = window.EMAIL_DOMAIN;
const SUNEUNG_DATE = window.SUNEUNG_DATE;
const usernameToEmail = (u) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

let me = null;
let currentRoute = "home";
let currentMaterial = null;
let calCursor = new Date();
let calSelected = null;

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function toast(msg, type = "ok"){
  const root = $("#toast");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

function showModal(title, bodyHtml){
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = bodyHtml;
  $("#modal-root").classList.remove("hidden");
}
function closeModal(){ $("#modal-root").classList.add("hidden"); }
$("#modal-close").addEventListener("click", closeModal);
$("#modal-bg").addEventListener("click", closeModal);

/* ============================================================ */
async function init(){
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadMe(session.user.id);
    if (me) showApp(); else showAuth();
  } else {
    showAuth();
  }
  setTimeout(() => {
    $("#loader").style.opacity = "0";
    setTimeout(() => $("#loader").remove(), 500);
  }, 250);
}

async function loadMe(uid){
  const { data, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error || !data) { me = null; return; }
  me = data;
}

function showAuth(){
  $("#view-auth").classList.remove("hidden");
  $("#view-app").classList.add("hidden");
}
function showApp(){
  $("#view-auth").classList.add("hidden");
  $("#view-app").classList.remove("hidden");
  document.body.classList.remove("is-mentor", "is-mentee");
  document.body.classList.add(me.role === "mentor" ? "is-mentor" : "is-mentee");
  $("#user-name").textContent = me.display_name || me.username;
  $("#user-role").textContent = me.role === "mentor" ? "MENTOR" : "MENTEE";
  const av = $("#user-avatar");
  av.textContent = (me.display_name || me.username).charAt(0).toUpperCase();
  av.classList.toggle("mentor", me.role === "mentor");
  navigate("home");
  renderDday();
  loadHomeStats();
}

/* ============================================================ AUTH */
$$(".tab").forEach(t => t.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.toggle("active", x === t));
  const tab = t.dataset.tab;
  $("#form-login").classList.toggle("hidden", tab !== "login");
  $("#form-signup").classList.toggle("hidden", tab !== "signup");
}));

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("#login-username").value.trim().toLowerCase();
  const p = $("#login-password").value;
  const msg = $("#login-msg");
  msg.className = "form-msg";
  msg.textContent = "로그인 중...";
  const { data, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
  if (error) { msg.className = "form-msg err"; msg.textContent = "아이디 또는 비밀번호가 올바르지 않습니다."; return; }
  await loadMe(data.user.id);
  if (!me) { msg.className = "form-msg err"; msg.textContent = "프로필을 찾을 수 없습니다."; return; }
  msg.className = "form-msg ok"; msg.textContent = "로그인 완료!";
  showApp();
});

$("#form-signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u  = $("#signup-username").value.trim().toLowerCase();
  const nm = $("#signup-name").value.trim();
  const p  = $("#signup-password").value;
  const p2 = $("#signup-password2").value;
  const msg = $("#signup-msg");
  msg.className = "form-msg";

  if (!/^[a-z0-9_]{3,20}$/.test(u)) { msg.className = "form-msg err"; msg.textContent = "아이디는 영문 소문자/숫자/_ 3-20자."; return; }
  if (p !== p2) { msg.className = "form-msg err"; msg.textContent = "비밀번호가 일치하지 않습니다."; return; }
  if (p.length < 6) { msg.className = "form-msg err"; msg.textContent = "비밀번호는 6자 이상이어야 합니다."; return; }

  msg.textContent = "가입 중...";
  const { error } = await sb.auth.signUp({
    email: usernameToEmail(u),
    password: p,
    options: { data: { username: u, display_name: nm } }
  });
  if (error) {
    msg.className = "form-msg err";
    msg.textContent = /already/i.test(error.message) ? "이미 사용 중인 아이디입니다." : ("가입 실패: " + error.message);
    return;
  }
  msg.className = "form-msg ok"; msg.textContent = "가입 완료! 로그인합니다...";
  const { data: ld } = await sb.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
  if (ld?.user) {
    await loadMe(ld.user.id);
    showApp();
  } else {
    $$(".tab")[0].click();
  }
});

$("#btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  me = null;
  location.reload();
});

/* ============================================================ ROUTER */
$$(".sb-link").forEach(l => l.addEventListener("click", () => navigate(l.dataset.route)));
$$(".stat-card").forEach(c => c.addEventListener("click", () => navigate(c.dataset.route)));
$("#material-back").addEventListener("click", () => navigate(currentMaterial?.cat === "mockexam" ? "mockexam" : "textbook"));

function navigate(route){
  currentRoute = route;
  $$(".page").forEach(p => p.classList.add("hidden"));
  $$(".sb-link").forEach(l => l.classList.toggle("active", l.dataset.route === route));
  if (route === "home")     { $("#page-home").classList.remove("hidden"); loadHomeStats(); renderDday(); }
  if (route === "textbook") { $("#page-textbook").classList.remove("hidden"); loadMaterials("textbook"); }
  if (route === "mockexam") { $("#page-mockexam").classList.remove("hidden"); loadMaterials("mockexam"); }
  if (route === "material") { $("#page-material").classList.remove("hidden"); }
  if (route === "videos")   { $("#page-videos").classList.remove("hidden"); loadVideos(); }
  if (route === "schedule") { $("#page-schedule").classList.remove("hidden"); renderCalendar(); loadDay(calSelected); }
}

/* ============================================================ HOME */
function renderDday(){
  const today = new Date();
  const target = new Date(SUNEUNG_DATE + "T00:00:00");
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  const el = $("#hero-dday");
  if (diff > 0) el.textContent = `D-${diff}`;
  else if (diff === 0) el.textContent = "D-DAY";
  else el.textContent = `D+${-diff}`;
  const total = 365;
  const elapsed = Math.max(0, Math.min(total, total - diff));
  $("#hero-bar-fill").style.width = `${(elapsed / total * 100).toFixed(1)}%`;
  $("#hero-sub").textContent = diff > 0 ? `오늘도 한 걸음. 남은 ${diff}일을 단단하게.` : "수고했어요.";
}

async function loadHomeStats(){
  try {
    const [{ count: tb }, { count: mk }, { count: vd }] = await Promise.all([
      sb.from("materials").select("*", { count: "exact", head: true }).eq("category", "textbook"),
      sb.from("materials").select("*", { count: "exact", head: true }).eq("category", "mockexam"),
      sb.from("videos").select("*", { count: "exact", head: true }),
    ]);
    $("#stat-textbook").textContent = tb ?? 0;
    $("#stat-mockexam").textContent = mk ?? 0;
    $("#stat-videos").textContent   = vd ?? 0;

    const today = new Date().toISOString().slice(0, 10);
    const { data: nx } = await sb.from("schedule").select("*").gte("class_date", today).order("class_date").limit(3);
    const nc = $("#next-class");
    if (!nx || nx.length === 0) nc.innerHTML = `<div class="empty">예정된 수업이 없습니다.</div>`;
    else nc.innerHTML = nx.map(s => `
      <div class="day-class-item">
        <div>
          <div class="dc-title">${escHtml(s.title || "수업")}</div>
          <div class="dc-desc">${s.class_date} ${s.start_time ? "· " + s.start_time.slice(0, 5) : ""}</div>
        </div>
      </div>`).join("");

    const { data: rc } = await sb.from("materials").select("*").order("created_at", { ascending: false }).limit(5);
    const ra = $("#recent-activity");
    if (!rc || rc.length === 0) ra.innerHTML = `<div class="empty">활동이 없습니다.</div>`;
    else ra.innerHTML = rc.map(m => `
      <div class="day-class-item">
        <div>
          <div class="dc-title">${escHtml(m.title)}</div>
          <div class="dc-desc">${m.category === "textbook" ? "수업 교재" : "모의고사"} · ${fmtDate(m.created_at)}</div>
        </div>
      </div>`).join("");
  } catch (e) { console.error(e); }
}

/* ============================================================ MATERIALS */
$("#btn-add-textbook").addEventListener("click", () => addMaterial("textbook"));
$("#btn-add-mockexam").addEventListener("click", () => addMaterial("mockexam"));

async function addMaterial(cat){
  const inputId = cat === "textbook" ? "new-textbook-title" : "new-mockexam-title";
  const t = $("#" + inputId).value.trim();
  if (!t) { toast("이름을 입력하세요.", "err"); return; }
  const { error } = await sb.from("materials").insert({ title: t, category: cat, created_by: me.id });
  if (error) { toast("추가 실패: " + error.message, "err"); return; }
  $("#" + inputId).value = "";
  toast("추가됨", "ok");
  loadMaterials(cat);
}

async function loadMaterials(cat){
  const listEl = $(cat === "textbook" ? "#list-textbook" : "#list-mockexam");
  listEl.innerHTML = `<div class="empty">불러오는 중...</div>`;
  const { data, error } = await sb.from("materials").select("*").eq("category", cat).order("created_at", { ascending: false });
  if (error) { listEl.innerHTML = `<div class="empty">불러오기 실패</div>`; return; }
  if (!data || data.length === 0) {
    listEl.innerHTML = `<div class="empty">아직 등록된 ${cat === "textbook" ? "교재" : "모의고사"}가 없습니다.</div>`;
    return;
  }
  listEl.innerHTML = data.map(m => `
    <div class="mat-card" data-id="${m.id}">
      ${me.role === "mentor" ? `<button class="mat-card-del" data-del="${m.id}">삭제</button>` : ""}
      <div class="mat-card-title">${escHtml(m.title)}</div>
      <div class="mat-card-meta">
        <span class="tag ${m.pdf_path ? "ok" : ""}">${m.pdf_path ? "PDF ✓" : "PDF 없음"}</span>
        <span class="tag ${Object.keys(m.answer_key || {}).length ? "ok" : ""}">정답 ${Object.keys(m.answer_key || {}).length}</span>
        <span class="tag ${(m.allowed_questions || []).length ? "warn" : ""}">숙제 ${(m.allowed_questions || []).length}문항</span>
      </div>
    </div>`).join("");

  $$("#" + listEl.id + " .mat-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.matches("[data-del]")) return;
      openMaterial(card.dataset.id, cat);
    });
  });
  $$("#" + listEl.id + " [data-del]").forEach(b => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const { error } = await sb.from("materials").delete().eq("id", b.dataset.del);
    if (error) toast("삭제 실패", "err");
    else { toast("삭제됨"); loadMaterials(cat); }
  }));
}

async function openMaterial(id, cat){
  const { data, error } = await sb.from("materials").select("*").eq("id", id).maybeSingle();
  if (error || !data) { toast("불러오기 실패", "err"); return; }
  currentMaterial = { ...data, cat };
  $("#material-category").textContent = cat === "textbook" ? "수업 교재" : "모의고사";
  $("#material-title").textContent = data.title;
  $("#m-total").value = data.total_questions || "";
  $("#m-allowed").value = compressNums(data.allowed_questions || []);
  $("#answer-pdf-status").textContent = data.answer_pdf_path ? "업로드됨 ✓" : "업로드 안됨";

  const pdfBody = $("#material-pdf-body");
  if (data.pdf_path) {
    const url = await getSignedUrl("materials", data.pdf_path);
    pdfBody.innerHTML = `
      <div class="pdf-item">
        <div class="pdf-ic">PDF</div>
        <div style="flex:1;">
          <div class="pdf-name">${escHtml(data.title)}.pdf</div>
          <div class="pdf-meta">${fmtDate(data.created_at)}</div>
        </div>
        <a class="btn-ghost" href="${url}" download="${escHtml(data.title)}.pdf" target="_blank">다운로드</a>
      </div>`;
  } else {
    pdfBody.innerHTML = `<div class="empty">업로드된 파일이 없습니다.</div>`;
  }

  renderAnswerKeyGrid();
  renderMenteeAnswers();
  loadMentorSubs();
  navigate("material");
}

function compressNums(arr){
  if (!arr || arr.length === 0) return "";
  const s = [...arr].sort((a, b) => a - b);
  const out = []; let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}
function parseNums(str){
  if (!str) return [];
  const out = new Set();
  str.split(",").forEach(part => {
    part = part.trim();
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) { const a = +m[1], b = +m[2]; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i); }
    else if (/^\d+$/.test(part)) out.add(+part);
  });
  return [...out].sort((a, b) => a - b);
}

$("#upload-pdf").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  await uploadMaterialPdf(f, "pdf_path");
  e.target.value = "";
});
$("#upload-answer-pdf").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  await uploadMaterialPdf(f, "answer_pdf_path");
  e.target.value = "";
});

async function uploadMaterialPdf(file, field){
  if (!currentMaterial) return;
  toast("업로드 중...");
  const path = `${currentMaterial.id}/${field}-${Date.now()}.pdf`;
  const { error: upErr } = await sb.storage.from("materials").upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (upErr) { toast("업로드 실패: " + upErr.message, "err"); return; }
  const { error } = await sb.from("materials").update({ [field]: path }).eq("id", currentMaterial.id);
  if (error) { toast("저장 실패: " + error.message, "err"); return; }
  toast("업로드 완료", "ok");
  openMaterial(currentMaterial.id, currentMaterial.cat);
}

async function getSignedUrl(bucket, path){
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl || "#";
}

$("#btn-save-meta").addEventListener("click", async () => {
  if (!currentMaterial) return;
  const total = parseInt($("#m-total").value || "0", 10);
  const allowed = parseNums($("#m-allowed").value);
  const { error } = await sb.from("materials").update({ total_questions: total, allowed_questions: allowed }).eq("id", currentMaterial.id);
  if (error) { toast("저장 실패", "err"); return; }
  currentMaterial.total_questions = total;
  currentMaterial.allowed_questions = allowed;
  toast("저장됨", "ok");
  renderAnswerKeyGrid();
});

$("#btn-gen-answer-grid").addEventListener("click", () => renderAnswerKeyGrid());

function renderAnswerKeyGrid(){
  if (!currentMaterial) return;
  const total = currentMaterial.total_questions || 0;
  const key = currentMaterial.answer_key || {};
  const el = $("#answer-key-grid");
  if (total === 0) { el.innerHTML = `<div class="empty">총 문항 수를 먼저 입력하세요.</div>`; return; }
  let html = "";
  for (let i = 1; i <= total; i++) {
    html += `<div class="ans-cell"><span class="num">${i}</span><input data-q="${i}" value="${escAttr(key[i] ?? "")}" maxlength="20" /></div>`;
  }
  el.innerHTML = html;
}

$("#btn-save-answer-key").addEventListener("click", async () => {
  if (!currentMaterial) return;
  const inputs = $$("#answer-key-grid input[data-q]");
  const key = {};
  inputs.forEach(i => { const v = i.value.trim(); if (v) key[i.dataset.q] = v; });
  const { error } = await sb.from("materials").update({ answer_key: key }).eq("id", currentMaterial.id);
  if (error) { toast("저장 실패", "err"); return; }
  currentMaterial.answer_key = key;
  toast("정답 저장됨", "ok");
});

async function renderMenteeAnswers(){
  if (!currentMaterial || me.role !== "mentee") return;
  const total = currentMaterial.total_questions || 0;
  const allowed = new Set(currentMaterial.allowed_questions || []);
  const info = $("#homework-info");
  if (total === 0 || allowed.size === 0) {
    info.textContent = "아직 멘토가 숙제 범위를 지정하지 않았습니다.";
    $("#mentee-answer-grid").innerHTML = "";
    return;
  }
  info.textContent = `숙제 범위: ${compressNums([...allowed])} (총 ${allowed.size}문항)`;

  const { data: sub } = await sb.from("submissions").select("*").eq("material_id", currentMaterial.id).eq("user_id", me.id).maybeSingle();
  const answers = sub?.answers || {};

  let html = "";
  for (let i = 1; i <= total; i++) {
    const ok = allowed.has(i);
    html += `<div class="ans-cell ${ok ? "" : "disabled"}"><span class="num">${i}</span><input data-q="${i}" ${ok ? "" : "disabled"} value="${escAttr(answers[i] ?? "")}" maxlength="20" /></div>`;
  }
  $("#mentee-answer-grid").innerHTML = html;

  const bd = $("#score-badge");
  if (sub?.score != null && sub?.total != null) {
    bd.classList.remove("hidden");
    bd.textContent = `${sub.score} / ${sub.total}`;
  } else {
    bd.classList.add("hidden");
  }
}

$("#btn-submit-grade").addEventListener("click", async () => {
  if (!currentMaterial || me.role !== "mentee") return;
  const key = currentMaterial.answer_key || {};
  const allowed = currentMaterial.allowed_questions || [];
  if (allowed.length === 0) { toast("숙제 범위가 없습니다.", "err"); return; }
  if (Object.keys(key).length === 0) { toast("아직 정답이 등록되지 않았습니다.", "err"); return; }

  const inputs = $$("#mentee-answer-grid input[data-q]:not([disabled])");
  const answers = {};
  inputs.forEach(i => { const v = i.value.trim(); if (v) answers[i.dataset.q] = v; });

  let score = 0, total = 0;
  const gradeRows = [];
  allowed.forEach(q => {
    const correct = (key[q] ?? "").toString().trim();
    if (!correct) return;
    total++;
    const mine = (answers[q] ?? "").toString().trim();
    const ok = mine && mine === correct;
    if (ok) score++;
    gradeRows.push({ q, mine, correct, ok });
  });

  const { error } = await sb.from("submissions").upsert({
    material_id: currentMaterial.id,
    user_id: me.id,
    answers, score, total,
    graded_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "material_id,user_id" });
  if (error) { toast("제출 실패: " + error.message, "err"); return; }

  toast(`제출 완료: ${score}/${total}`, "ok");

  inputs.forEach(i => {
    const q = +i.dataset.q;
    const row = gradeRows.find(r => r.q === q);
    if (!row) return;
    const cell = i.closest(".ans-cell");
    cell.classList.remove("correct", "wrong");
    cell.classList.add(row.ok ? "correct" : "wrong");
  });

  $("#score-badge").classList.remove("hidden");
  $("#score-badge").textContent = `${score} / ${total}`;

  const det = $("#grade-detail");
  det.classList.remove("hidden");
  det.innerHTML = `<strong>채점 결과 ${score}/${total}</strong><br>` + gradeRows.map(r => `
    <div>문항 ${r.q}: ${r.ok ? "<span style='color:var(--green)'>O</span>" : `<span style='color:var(--red)'>X</span> · 내 답 ${escHtml(r.mine || "—")} · 정답 ${escHtml(r.correct)}`}</div>
  `).join("");
});

async function loadMentorSubs(){
  if (!currentMaterial || me.role !== "mentor") return;
  const body = $("#mentor-subs-body");
  const { data, error } = await sb.from("submissions")
    .select("*, profiles!inner(username, display_name)")
    .eq("material_id", currentMaterial.id)
    .order("updated_at", { ascending: false });
  if (error) { body.innerHTML = `<div class="empty">불러오기 실패</div>`; return; }
  if (!data || data.length === 0) { body.innerHTML = `<div class="empty">아직 제출이 없습니다.</div>`; return; }
  body.innerHTML = data.map(s => `
    <div class="sub-row">
      <div>
        <div class="sub-name">${escHtml(s.profiles?.display_name || s.profiles?.username || "—")}</div>
        <div class="muted">${fmtDate(s.updated_at)}</div>
      </div>
      <div class="sub-score">${s.score ?? "-"} / ${s.total ?? "-"}</div>
    </div>`).join("");
}

/* ============================================================ VIDEOS */
$("#btn-open-upload-video").addEventListener("click", openUploadVideoModal);

function openUploadVideoModal(){
  showModal("강의 영상 업로드", `
    <form class="form" id="form-video">
      <label>제목</label>
      <input type="text" id="v-title" required maxlength="80" />
      <label>설명 (선택)</label>
      <input type="text" id="v-desc" maxlength="200" />
      <label>영상 파일</label>
      <input type="file" id="v-file" accept="video/*" required />
      <div class="form-hint">큰 영상은 시간이 걸릴 수 있습니다. 닫지 마세요.</div>
      <button class="btn-primary" type="submit">업로드</button>
      <div class="upload-progress hidden" id="v-progress">
        <div id="v-progress-text">업로드 중...</div>
        <div class="upload-bar"><div class="upload-bar-fill" id="v-progress-fill"></div></div>
      </div>
    </form>`);
  $("#form-video").addEventListener("submit", uploadVideo);
}

async function uploadVideo(e){
  e.preventDefault();
  const title = $("#v-title").value.trim();
  const desc  = $("#v-desc").value.trim();
  const file  = $("#v-file").files?.[0];
  if (!title || !file) return;
  const pgw = $("#v-progress");
  pgw.classList.remove("hidden");

  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  $("#v-progress-text").textContent = `업로드 중 — ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  $("#v-progress-fill").style.width = "10%";

  const { error: upErr } = await sb.storage.from("videos").upload(path, file, { upsert: false, contentType: file.type || "video/mp4" });
  if (upErr) { toast("업로드 실패: " + upErr.message, "err"); $("#v-progress-fill").style.width = "0"; return; }
  $("#v-progress-fill").style.width = "80%";

  const { error } = await sb.from("videos").insert({ title, description: desc, video_path: path, created_by: me.id });
  if (error) { toast("저장 실패: " + error.message, "err"); return; }
  $("#v-progress-fill").style.width = "100%";
  toast("업로드 완료", "ok");
  closeModal();
  loadVideos();
}

async function loadVideos(){
  const el = $("#list-videos");
  el.innerHTML = `<div class="empty">불러오는 중...</div>`;
  const { data, error } = await sb.from("videos").select("*").order("created_at", { ascending: false });
  if (error) { el.innerHTML = `<div class="empty">불러오기 실패</div>`; return; }
  if (!data || data.length === 0) { el.innerHTML = `<div class="empty">아직 영상이 없습니다.</div>`; return; }

  const urls = await Promise.all(data.map(v => getSignedUrl("videos", v.video_path)));

  el.innerHTML = data.map((v, i) => `
    <div class="video-card">
      ${me.role === "mentor" ? `<button class="vc-del" data-del="${v.id}" data-path="${escAttr(v.video_path)}">삭제</button>` : ""}
      <video src="${urls[i]}" controls preload="metadata"></video>
      <div class="vc-body">
        <div class="vc-title">${escHtml(v.title)}</div>
        ${v.description ? `<div class="vc-desc">${escHtml(v.description)}</div>` : ""}
        <div class="vc-desc">${fmtDate(v.created_at)}</div>
      </div>
    </div>`).join("");

  $$("#list-videos [data-del]").forEach(b => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("이 영상을 삭제할까요?")) return;
    await sb.storage.from("videos").remove([b.dataset.path]);
    const { error } = await sb.from("videos").delete().eq("id", b.dataset.del);
    if (error) toast("삭제 실패", "err");
    else { toast("삭제됨"); loadVideos(); }
  }));
}

/* ============================================================ CALENDAR */
$("#cal-prev").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
$("#cal-next").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
$("#btn-add-class").addEventListener("click", () => openAddClassModal());

async function renderCalendar(){
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $("#cal-title").textContent = `${y}. ${String(m + 1).padStart(2, "0")}`;

  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  const { data: rows } = await sb.from("schedule").select("*").gte("class_date", start).lte("class_date", end);
  const byDate = {};
  (rows || []).forEach(r => { (byDate[r.class_date] ||= []).push(r); });

  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) {
    const d = prevDays - startDay + i + 1;
    cells.push({ y: m === 0 ? y - 1 : y, m: m === 0 ? 11 : m - 1, d, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ y, m, d, other: false });
  let nextD = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ y: m === 11 ? y + 1 : y, m: m === 11 ? 0 : m + 1, d: nextD++, other: true });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  $("#cal-body").innerHTML = cells.map(c => {
    const ds = `${c.y}-${String(c.m + 1).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
    const dow = new Date(c.y, c.m, c.d).getDay();
    const has = byDate[ds];
    const label = has?.[0]?.title || "";
    return `<div class="cal-cell ${c.other ? "other" : ""} ${ds === todayStr ? "today" : ""} ${ds === calSelected ? "selected" : ""} ${dow === 0 ? "sun" : ""}" data-date="${ds}">
      <div class="cal-num">${c.d}</div>
      ${has ? `<div class="cal-label">${escHtml(label)}</div><div class="cal-dot"><span></span></div>` : ""}
    </div>`;
  }).join("");

  $$("#cal-body .cal-cell").forEach(c => c.addEventListener("click", () => {
    calSelected = c.dataset.date;
    $$("#cal-body .cal-cell").forEach(x => x.classList.toggle("selected", x.dataset.date === calSelected));
    loadDay(calSelected);
  }));
}

async function loadDay(date){
  const titleEl = $("#day-title");
  const body = $("#day-body");
  if (!date) { titleEl.textContent = "날짜를 선택하세요"; body.innerHTML = `<div class="empty">날짜를 클릭하세요.</div>`; return; }
  const [y, m, d] = date.split("-");
  titleEl.textContent = `${y}. ${m}. ${d}`;
  const { data, error } = await sb.from("schedule").select("*").eq("class_date", date).order("start_time", { ascending: true });
  if (error) { body.innerHTML = `<div class="empty">불러오기 실패</div>`; return; }
  if (!data || data.length === 0) { body.innerHTML = `<div class="empty">예정된 수업이 없습니다.</div>`; return; }
  body.innerHTML = data.map(c => `
    <div class="day-class-item">
      <div>
        <div class="dc-title">${escHtml(c.title || "수업")}</div>
        ${c.description ? `<div class="dc-desc">${escHtml(c.description)}</div>` : ""}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="dc-time">${c.start_time ? c.start_time.slice(0, 5) : ""} ${c.end_time ? "- " + c.end_time.slice(0, 5) : ""}</div>
        ${me.role === "mentor" ? `<button class="btn-ghost danger" data-del-class="${c.id}">삭제</button>` : ""}
      </div>
    </div>`).join("");
  $$("#day-body [data-del-class]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("이 수업을 삭제할까요?")) return;
    const { error } = await sb.from("schedule").delete().eq("id", b.dataset.delClass);
    if (error) toast("삭제 실패", "err");
    else { toast("삭제됨"); renderCalendar(); loadDay(date); }
  }));
}

function openAddClassModal(){
  const date = calSelected || new Date().toISOString().slice(0, 10);
  showModal("수업 추가", `
    <form class="form" id="form-class">
      <label>날짜</label>
      <input type="date" id="cl-date" value="${date}" required />
      <label>시작 시간</label>
      <input type="time" id="cl-start" />
      <label>종료 시간</label>
      <input type="time" id="cl-end" />
      <label>제목</label>
      <input type="text" id="cl-title" placeholder="예: 수학 보충" required maxlength="50" />
      <label>설명 (선택)</label>
      <input type="text" id="cl-desc" maxlength="200" />
      <button class="btn-primary" type="submit">추가</button>
    </form>`);
  $("#form-class").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      class_date: $("#cl-date").value,
      start_time: $("#cl-start").value || null,
      end_time: $("#cl-end").value || null,
      title: $("#cl-title").value.trim(),
      description: $("#cl-desc").value.trim() || null,
      created_by: me.id
    };
    const { error } = await sb.from("schedule").insert(payload);
    if (error) { toast("추가 실패: " + error.message, "err"); return; }
    toast("추가됨", "ok");
    closeModal();
    calSelected = payload.class_date;
    renderCalendar();
    loadDay(calSelected);
  });
}

/* ============================================================ UTIL */
function escHtml(s){ return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escAttr(s){ return escHtml(s); }
function fmtDate(s){ if (!s) return ""; const d = new Date(s); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; }

init();
