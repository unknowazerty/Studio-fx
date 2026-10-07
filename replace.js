// Studio FX — Remplacement IA : remplace la personne d'une vidéo par un personnage tiré d'une photo,
// avec le modèle open source Wan 2.2 Animate hébergé gratuitement sur Hugging Face (Gradio).
// Les paramètres du Space sont détectés à la connexion (view_api), pour suivre ses évolutions.

const DEFAULT_SPACE = "Wan-AI/Wan2.2-Animate";
const q = (s) => document.querySelector(s);

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
};

const rep = { video: null, photo: null, job: null, outUrl: null, timer: 0 };

/* ───────── Onglets ───────── */
const NOTES = {
  effects: "Effets caméra et VFX sur vos photos. Tout est calculé dans votre navigateur : gratuit, sans compte, rien n'est envoyé.",
  replace: "Remplacement de personnage par IA. Votre vidéo et votre photo sont envoyées au modèle Wan 2.2 Animate sur Hugging Face pour le calcul.",
};
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  if (typeof state !== "undefined" && state.recording) return toast("Attendez la fin de l'enregistrement en cours.", true);
  const view = tab.dataset.view;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === tab)));
  q("#view-effects").hidden = view !== "effects";
  q("#view-replace").hidden = view !== "replace";
  q("#topNote").textContent = NOTES[view];
  // L'aperçu des effets tourne en continu : on le met en pause hors de son onglet.
  if (view === "effects") { restartPreview(); fit(); } else cancelAnimationFrame(raf);
  try { history.replaceState(null, "", view === "replace" ? "#remplacement" : "#"); } catch { /* sans importance */ }
}));
if (location.hash === "#remplacement") document.querySelector('.tab[data-view="replace"]').click();

/* ───────── Fichiers ───────── */
function bindDrop(dropSel, inputSel, accept, onFile) {
  const drop = q(dropSel);
  q(inputSel).addEventListener("change", (e) => onFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f?.type.startsWith(accept)) onFile(f); else toast("Format non reconnu pour ce champ.", true); });
}
const mb = (n) => (n / 1048576).toFixed(1).replace(".", ",") + " Mo";

bindDrop("#vidDrop", "#vidFile", "video/", (file) => {
  if (!file) return;
  if (!file.type.startsWith("video/")) return toast("Ce fichier n'est pas une vidéo. Choisissez un MP4, MOV ou WebM.", true);
  rep.video = file;
  const url = URL.createObjectURL(file);
  const v = q("#srcVideo");
  v.src = url;
  v.onloadedmetadata = () => {
    const d = v.duration;
    q("#vidInfo").textContent = `${d.toFixed(1).replace(".", ",")} s · ${v.videoWidth}×${v.videoHeight} · ${mb(file.size)}`;
    if (d > 12) toast("Vidéo longue : le Space gratuit risque de la refuser ou de la couper. Visez 3 à 10 secondes.", true);
  };
  let prev = q("#vidDrop video");
  if (!prev) { prev = document.createElement("video"); prev.muted = true; prev.loop = true; prev.playsInline = true; q("#vidDrop").prepend(prev); }
  prev.src = url; prev.play().catch(() => {});
  q("#vidText").innerHTML = "<strong>Changer de vidéo</strong>";
  showSource();
  refresh();
});

bindDrop("#charDrop", "#charFile", "image/", (file) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Ce fichier n'est pas une image. Choisissez un JPG, PNG ou WebP.", true);
  rep.photo = file;
  const img = q("#charThumb");
  img.src = URL.createObjectURL(file);
  img.hidden = false;
  img.onload = () => (q("#charInfo").textContent = `${img.naturalWidth}×${img.naturalHeight}`);
  q("#charText").innerHTML = "<strong>Changer de photo</strong>";
  refresh();
});

function showSource() {
  if (!rep.video) return;
  q("#outVideo").hidden = true;
  q("#repEmpty").hidden = true;
  const v = q("#srcVideo");
  v.hidden = false;
  v.play().catch(() => {});
}

/* ───────── Réglages ───────── */
q("#hfToken").value = store.get("rep.token", "");
q("#spaceId").value = store.get("rep.space", "");
q("#hfToken").addEventListener("change", (e) => store.set("rep.token", e.target.value.trim()));
q("#spaceId").addEventListener("change", (e) => store.set("rep.space", e.target.value.trim()));
q("#consent").addEventListener("change", refresh);

function refresh() {
  const ready = rep.video && rep.photo;
  q("#repGo").disabled = !ready || !q("#consent").checked || !!rep.job;
  q("#repHint").textContent = !rep.video || !rep.photo ? "Ajoutez une vidéo et une photo pour commencer."
    : !q("#consent").checked ? "Cochez la case de consentement pour lancer la génération."
    : "Tout est prêt. La génération prend en général 2 à 10 minutes.";
}

/* ───────── Détection des paramètres du Space ───────── */
const choicesOf = (p) => {
  const t = `${p.python_type?.type ?? ""} ${typeof p.type === "string" ? p.type : JSON.stringify(p.type ?? "")}`;
  return [...t.matchAll(/['"]([^'"]{1,80})['"]/g)].map((m) => m[1]).filter((c, i, a) => a.indexOf(c) === i);
};
const comp = (p) => String(p.component ?? "").toLowerCase();

// Choisit l'endpoint qui prend une image et une vidéo, puis construit ses arguments dans l'ordre.
export function planCall(api, mode, files, handle) {
  const eps = Object.entries(api.named_endpoints ?? {}).filter(([, e]) =>
    e.parameters.some((p) => comp(p) === "image") && e.parameters.some((p) => comp(p) === "video"));
  if (!eps.length) throw new Error("Ce Space n'expose pas d'API acceptant une image et une vidéo.");
  eps.sort(([a], [b]) => (/generat|predict|run|infer|animate/i.test(b) ? 1 : 0) - (/generat|predict|run|infer|animate/i.test(a) ? 1 : 0));
  const [endpoint, info] = eps[0];
  const wantReplace = mode === "replace";
  const notes = [];
  const args = info.parameters.map((p) => {
    const c = comp(p), label = p.label || p.parameter_name;
    if (c === "image") { notes.push(`${label} ← photo`); return handle(files.photo); }
    if (c === "video") {
      notes.push(`${label} ← vidéo`);
      return /video\s*:/.test(p.python_type?.type ?? "") ? { video: handle(files.video), subtitles: null } : handle(files.video);
    }
    const ch = choicesOf(p);
    const modeRe = wantReplace ? /mix|replac|remplac|swap/i : /move|anim/i;
    if (ch.length > 1 && ch.some((x) => /mix|move|replac|anim/i.test(x))) {
      const pick = ch.find((x) => modeRe.test(x)) ?? (p.parameter_has_default ? p.parameter_default : ch[0]);
      notes.push(`${label} ← ${pick}`);
      return pick;
    }
    if (p.parameter_has_default) { notes.push(`${label} = ${JSON.stringify(p.parameter_default)} (défaut)`); return p.parameter_default; }
    const v = p.example_input ?? (ch[0] ?? null);
    notes.push(`${label} = ${JSON.stringify(v)} (exemple)`);
    return v;
  });
  return { endpoint, args, notes };
}

// Trouve l'URL de la vidéo dans la réponse, quel que soit son emballage.
export function findVideoUrl(data) {
  const seen = new Set();
  const walk = (x) => {
    if (!x || seen.has(x)) return null;
    if (typeof x === "string") return /^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(x) ? x : null;
    if (typeof x !== "object") return null;
    seen.add(x);
    if (typeof x.url === "string" && (/video/.test(x.mime_type ?? "") || /\.(mp4|webm|mov)(\?|$)/i.test(x.url) || /\.(mp4|webm|mov)$/i.test(x.orig_name ?? x.path ?? ""))) return x.url;
    for (const v of Array.isArray(x) ? x : Object.values(x)) { const r = walk(v); if (r) return r; }
    return null;
  };
  return walk(data);
}

/* ───────── Génération ───────── */
const debug = (txt) => (q("#repDebug").textContent = txt);
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function busy(on) {
  q("#repBusy").hidden = !on;
  clearInterval(rep.timer);
  if (on) {
    const t0 = Date.now();
    q("#repBar").style.width = "0";
    rep.timer = setInterval(() => (q("#repElapsed").textContent = mmss((Date.now() - t0) / 1000)), 1000);
  }
}
const stage = (title, detail = "") => { q("#repStage").textContent = title; q("#repDetail").textContent = detail; q("#repStatus").textContent = title; };

function explain(err) {
  const m = String(err?.message ?? err ?? "");
  if (/quota|exceeded|ZeroGPU|GPU.*(limit|time)/i.test(m)) return "Quota gratuit atteint. Ajoutez un jeton Hugging Face (compte gratuit) ou réessayez plus tard.";
  if (/401|403|unauthor|token/i.test(m)) return "Jeton Hugging Face refusé. Vérifiez qu'il commence par hf_ et qu'il a le droit « Read ».";
  if (/sleep|paused|building|not.?found|404/i.test(m)) return "Le Space est indisponible (en pause ou introuvable). Réessayez plus tard ou indiquez un autre Space dans les réglages avancés.";
  if (/fetch|network|Failed to|metadata|could not be (loaded|resolved)|connect/i.test(m)) return "Connexion impossible au Space. Vérifiez votre connexion internet, puis réessayez.";
  return "La génération a échoué : " + (m.replace(/[.\s]+$/, "") || "erreur inconnue") + ".";
}

q("#repGo").addEventListener("click", async () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const space = q("#spaceId").value.trim() || DEFAULT_SPACE;
  const token = q("#hfToken").value.trim();
  if (token && !token.startsWith("hf_")) return toast("Le jeton Hugging Face doit commencer par hf_.", true);

  rep.job = { cancelled: false, sub: null };
  refresh();
  busy(true);
  q("#repDownload").hidden = true;
  stage("Connexion au modèle…", space);

  try {
    const { Client, handle_file } = await import("./vendor/gradio-client/browser.js");
    const client = await Client.connect(space, {
      ...(token ? { token } : {}),
      status_callback: (s) => { if (s.status && s.status !== "running") stage("Démarrage du Space…", s.message || s.detail || ""); },
    });
    const api = await client.view_api();
    const plan = planCall(api, mode, { photo: rep.photo, video: rep.video }, handle_file);
    debug(`Space : ${space}\nEndpoint : ${plan.endpoint}\n` + plan.notes.join("\n"));
    if (rep.job.cancelled) throw new Error("Annulé");

    stage("Envoi de la vidéo et de la photo…");
    const sub = client.submit(plan.endpoint, plan.args);
    rep.job.sub = sub;
    let url = null;
    for await (const ev of sub) {
      if (rep.job.cancelled) break;
      if (ev.type === "status") {
        if (ev.stage === "error") throw new Error(typeof ev.message === "string" ? ev.message : JSON.stringify(ev.message ?? "erreur"));
        if (ev.stage === "pending") {
          const pos = ev.position != null ? `Position ${ev.position + 1} dans la file` : "En file d'attente";
          stage(pos, ev.eta ? `attente estimée ~${mmss(ev.eta)}` : "");
        } else if (ev.stage === "generating" || ev.stage === "streaming") {
          const pd = ev.progress_data?.find((x) => x.index != null && x.length);
          if (pd) q("#repBar").style.width = `${Math.round((pd.index / pd.length) * 100)}%`;
          stage("Génération en cours…", pd?.desc || (ev.eta ? `fin estimée ~${mmss(ev.eta)}` : ""));
        } else if (ev.stage === "complete" && ev.success === false) {
          throw new Error(typeof ev.message === "string" ? ev.message : "le Space a renvoyé une erreur");
        }
      } else if (ev.type === "data") {
        url = findVideoUrl(ev.data) || url;
        q("#repDebug").textContent += `\n\nRéponse : ${JSON.stringify(ev.data).slice(0, 600)}`;
        if (url) break;
      }
    }
    if (rep.job.cancelled) throw new Error("Annulé");
    if (!url) throw new Error("le Space n'a pas renvoyé de vidéo (voir « Réglages avancés »)");

    rep.outUrl = url;
    const out = q("#outVideo");
    out.src = url;
    q("#srcVideo").hidden = true;
    out.hidden = false;
    out.play().catch(() => {});
    q("#repDownload").hidden = false;
    stage("Vidéo prête ✓");
    toast("Vidéo prête.");
  } catch (e) {
    if (String(e?.message) === "Annulé") { stage("Annulé"); showSource(); }
    else { const msg = explain(e); stage("Échec"); toast(msg, true); q("#repDebug").textContent += `\n\nErreur : ${e?.message ?? e}`; }
  } finally {
    busy(false);
    rep.job = null;
    refresh();
  }
});

q("#repCancel").addEventListener("click", () => {
  if (!rep.job) return;
  rep.job.cancelled = true;
  rep.job.sub?.cancel?.().catch?.(() => {});
  stage("Annulation…");
});

// Téléchargement : le fichier est servi par un autre domaine, on passe par un blob pour forcer l'enregistrement.
q("#repDownload").addEventListener("click", async () => {
  if (!rep.outUrl) return;
  try {
    const blob = await (await fetch(rep.outUrl)).blob();
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "studio-fx-remplacement.mp4" });
    document.body.append(a); a.click(); a.remove();
  } catch {
    window.open(rep.outUrl, "_blank", "noopener");
  }
});

refresh();
