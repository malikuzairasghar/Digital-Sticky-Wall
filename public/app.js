"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  notes:              [],
  selectedColor:      "#FFDEE9",
  selectedFont:       "default",
  pendingDeleteId:    null,
  searchQuery:        "",
  sortOrder:          "newest",
  currentUser:        null,
  rteTextColor:       "auto",
  rteHighlightColor:  "none",
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const DOM = {
  // Header
  statsPill:       $("statsPill"),
  statsCount:      $("statsCount"),
  // Wall
  notesGrid:       $("notesGrid"),
  emptyState:      $("emptyState"),
  fabBtn:          $("fabBtn"),
  searchInput:     $("searchInput"),
  sortSelect:      $("sortSelect"),
  // Add modal
  modalBackdrop:        $("modalBackdrop"),
  modalClose:           $("modalClose"),
  cancelBtn:            $("cancelBtn"),
  submitBtn:            $("submitBtn"),
  noteTitle:            $("noteTitle"),
  noteDesc:             $("noteDesc"),
  titleCount:           $("titleCount"),
  descCount:            $("descCount"),
  formError:            $("formError"),
  colorSwatches:        $("colorSwatches"),
  fontOptions:          $("fontOptions"),
  // RTE toolbar
  rteToolbar:           $("rteToolbar"),
  textColorSwatches:    $("textColorSwatches"),
  highlightColorSwatches: $("highlightColorSwatches"),
  rteClearBtn:          $("rteClearBtn"),
  // Delete modal
  deleteBackdrop:  $("deleteBackdrop"),
  deleteCancelBtn: $("deleteCancelBtn"),
  deleteConfirmBtn:$("deleteConfirmBtn"),
  toastContainer:  $("toastContainer"),
};

// ── API layer ─────────────────────────────────────────────────────────────────
const API = {
  async _json(res) {
    const text = await res.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); }
    catch { throw new Error(`Unexpected server response (HTTP ${res.status}).`); }
  },
  async get(path) {
    const res = await fetch("/api" + path, { credentials: "include" });
    const d = await this._json(res);
    if (!res.ok) throw new Error(d.message || `HTTP ${res.status}`);
    return d;
  },
  async post(path, body) {
    const res = await fetch("/api" + path, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await this._json(res);
    if (!res.ok) throw new Error(d.message || `HTTP ${res.status}`);
    return d;
  },
  async del(path) {
    const res = await fetch("/api" + path, { method: "DELETE", credentials: "include" });
    const d = await this._json(res);
    if (!res.ok) throw new Error(d.message || `HTTP ${res.status}`);
    return d;
  },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

// Allow only <span> with style containing color/background-color, and <br>
function sanitizeNoteHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === "span") {
          // Only keep color / background-color style properties
          const allowed = [];
          const s = child.style;
          if (s.color)           allowed.push(`color:${s.color}`);
          if (s.backgroundColor) allowed.push(`background-color:${s.backgroundColor}`);
          child.removeAttribute("class");
          child.removeAttribute("id");
          // Remove all other attributes
          [...child.attributes].forEach(a => {
            if (a.name !== "style") child.removeAttribute(a.name);
          });
          child.setAttribute("style", allowed.join(";"));
          clean(child);
        } else if (tag === "br") {
          // keep as-is
        } else {
          // Replace with its children
          const frag = document.createDocumentFragment();
          [...child.childNodes].forEach(c => frag.appendChild(c.cloneNode(true)));
          clean(frag);
          child.replaceWith(frag);
        }
      } else {
        child.remove();
      }
    });
  }
  clean(tmp);
  return tmp.innerHTML;
}

function formatTime(iso) {
  const d    = new Date(iso);
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
}

function showToast(msg, type = "success", duration = 2800) {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.animation = "toastOut 0.3s ease forwards";
    t.addEventListener("animationend", () => t.remove(), { once: true });
  }, duration);
}

function setLoading(btn, loading) {
  const text   = btn.querySelector(".auth-btn-text, .btn-text");
  const loader = btn.querySelector(".auth-btn-loader, .btn-loader");
  btn.disabled = loading;
  if (text)   text.hidden   = loading;
  if (loader) loader.hidden = !loading;
}

// ── Font map ──────────────────────────────────────────────────────────────────
const FONT_FAMILIES = {
  default:   "'DM Sans', -apple-system, sans-serif",
  playfair:  "'Playfair Display', Georgia, serif",
  caveat:    "'Caveat', cursive",
  dancing:   "'Dancing Script', cursive",
  courier:   "'Courier Prime', 'Courier New', monospace",
  nastaleeq: "'Noto Nastaliq Urdu', serif",
};



// ══════════════════════════════════════════════════════════════════════════════
//  NOTES — render
// ══════════════════════════════════════════════════════════════════════════════

function createNoteCard(note, delay = 0) {
  const card = document.createElement("article");
  card.className = "note-card";
  card.dataset.id = note.id;
  card.style.background = note.color;
  card.style.animationDelay = `${delay}ms`;

  // Apply font class
  const font = note.font || "default";
  if (font !== "default") card.classList.add(`font-${font}`);

  const isUrdu = font === "nastaleeq";

  card.innerHTML = `
    <div class="note-pin">📌</div>
    <div class="note-top">
      <h3 class="note-title">${escapeHtml(note.title)}</h3>
      <div class="note-actions">
        <button class="note-float-btn" data-id="${note.id}" title="Float on screen" aria-label="Pin to screen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
          </svg>
        </button>
        <button class="note-delete-btn" data-id="${note.id}" title="Delete" aria-label="Delete note">✕</button>
      </div>
    </div>
    <div class="note-desc">${sanitizeNoteHtml(note.descHtml || escapeHtml(note.description || ""))}</div>
    <div class="note-footer">
      <time class="note-time" datetime="${note.createdAt}">${formatTime(note.createdAt)}</time>
      <span class="note-badge${isUrdu ? " badge-ur" : ""}">${isUrdu ? "نوٹ" : "Note"}</span>
    </div>
  `;

  card.querySelector(".note-delete-btn").addEventListener("click", e => {
    e.stopPropagation();
    openDeleteDialog(note.id);
  });
  card.querySelector(".note-float-btn").addEventListener("click", e => {
    e.stopPropagation();
    pinNoteToScreen(note);
  });

  return card;
}

function applyFilters(notes) {
  let r = [...notes];
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    r = r.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q)
    );
  }
  switch (State.sortOrder) {
    case "oldest": r.sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt)); break;
    case "alpha":  r.sort((a,b) => a.title.localeCompare(b.title)); break;
    default:       r.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  }
  return r;
}

function renderNotes(notes) {
  DOM.notesGrid.innerHTML = "";
  const display = applyFilters(notes);

  if (display.length === 0) {
    DOM.emptyState.hidden = false;
  } else {
    DOM.emptyState.hidden = true;
    display.forEach((note, i) => {
      DOM.notesGrid.appendChild(createNoteCard(note, i * 45));
    });
  }
  DOM.statsCount.textContent = notes.length;
}

async function loadNotes() {
  try {
    const data = await API.get("/notes");
    State.notes = data.notes || [];
    renderNotes(State.notes);
  } catch (err) {
    console.error(err);
    showToast("Could not load notes. Please refresh.", "error");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADD NOTE MODAL
// ══════════════════════════════════════════════════════════════════════════════

function openModal() {
  // Reset form
  DOM.noteTitle.value    = "";
  DOM.noteDesc.innerHTML = "";
  DOM.titleCount.textContent = "0/60";
  DOM.descCount.textContent  = "0/600";
  DOM.titleCount.classList.remove("warn");
  DOM.descCount.classList.remove("warn");
  DOM.formError.hidden = true;
  setLoading(DOM.submitBtn, false);

  // Reset font to default
  selectFont("default");

  // Reset RTE toolbar selections
  selectRteTextColor("auto");
  selectRteHighlight("none");

  DOM.modalBackdrop.classList.add("open");
  DOM.modalBackdrop.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  setTimeout(() => DOM.noteTitle.focus(), 350);
}

function closeModal() {
  DOM.modalBackdrop.classList.remove("open");
  DOM.modalBackdrop.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

function openDeleteDialog(id) {
  State.pendingDeleteId = id;
  DOM.deleteBackdrop.classList.add("open");
  DOM.deleteBackdrop.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

function closeDeleteDialog() {
  DOM.deleteBackdrop.classList.remove("open");
  DOM.deleteBackdrop.setAttribute("aria-hidden","true");
  State.pendingDeleteId = null;
  document.body.style.overflow = "";
}

function showFormError(msg) {
  DOM.formError.textContent = msg;
  DOM.formError.hidden = false;
}

// ── Font picker ───────────────────────────────────────────────────────────────
function selectFont(font) {
  State.selectedFont = font;
  const isUrdu = font === "nastaleeq";

  // Highlight button
  DOM.fontOptions.querySelectorAll(".font-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.font === font);
  });

  // Apply RTL class to editor for Urdu
  DOM.noteTitle.classList.toggle("rtl", isUrdu);
  DOM.noteDesc.classList.toggle("rtl", isUrdu);

  // Live-preview font in the editor
  const family = FONT_FAMILIES[font] || FONT_FAMILIES.default;
  DOM.noteTitle.style.fontFamily = family;
  DOM.noteDesc.style.fontFamily  = family;

  if (isUrdu) {
    DOM.noteTitle.setAttribute("dir","rtl");
    DOM.noteDesc.setAttribute("dir","rtl");
    DOM.noteTitle.placeholder = "نوٹ کا عنوان لکھیں…";
    DOM.noteDesc.dataset.placeholder = "یہاں اپنا نوٹ لکھیں…";
    DOM.noteTitle.setAttribute("lang","ur");
    DOM.noteDesc.setAttribute("lang","ur");
  } else {
    DOM.noteTitle.removeAttribute("dir");
    DOM.noteDesc.removeAttribute("dir");
    DOM.noteTitle.removeAttribute("lang");
    DOM.noteDesc.removeAttribute("lang");
    DOM.noteTitle.placeholder = "Give your note a title…";
    DOM.noteDesc.dataset.placeholder = "Write your note here…";
  }
}

function initFontPicker() {
  DOM.fontOptions.querySelectorAll(".font-opt").forEach(btn => {
    btn.addEventListener("click", () => selectFont(btn.dataset.font));
  });
}

// ── RTE toolbar ───────────────────────────────────────────────────────────────

function selectRteTextColor(color) {
  State.rteTextColor = color;
  DOM.textColorSwatches.querySelectorAll(".rte-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.color === color);
  });
}

function selectRteHighlight(color) {
  State.rteHighlightColor = color;
  DOM.highlightColorSwatches.querySelectorAll(".rte-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.color === color);
  });
}

function applyRteFormat(type, value) {
  // Restore focus to editor then apply
  DOM.noteDesc.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  // Only act if selection is inside the editor
  if (!DOM.noteDesc.contains(range.commonAncestorContainer)) return;

  // Wrap selection in a span
  const span = document.createElement("span");
  if (type === "color") {
    span.style.color = value;
  } else {
    span.style.backgroundColor = value;
  }
  try {
    range.surroundContents(span);
  } catch {
    // Selection crosses element boundaries — extract and wrap
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  newRange.collapse(false);
  sel.addRange(newRange);
}

function initRteToolbar() {
  // Prevent toolbar clicks from stealing editor focus/selection
  DOM.rteToolbar.addEventListener("mousedown", e => e.preventDefault());

  DOM.textColorSwatches.querySelectorAll(".rte-swatch").forEach(s => {
    s.addEventListener("click", () => {
      const color = s.dataset.color;
      selectRteTextColor(color);
      if (color !== "auto") applyRteFormat("color", color);
    });
  });

  DOM.highlightColorSwatches.querySelectorAll(".rte-swatch").forEach(s => {
    s.addEventListener("click", () => {
      const color = s.dataset.color;
      selectRteHighlight(color);
      if (color !== "none") applyRteFormat("highlight", color);
    });
  });

  DOM.rteClearBtn.addEventListener("click", () => {
    DOM.noteDesc.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      // No selection: strip all formatting from entire editor
      const text = DOM.noteDesc.textContent;
      DOM.noteDesc.textContent = text;
    } else {
      const range = sel.getRangeAt(0);
      if (!DOM.noteDesc.contains(range.commonAncestorContainer)) return;
      const text = range.toString();
      const textNode = document.createTextNode(text);
      range.deleteContents();
      range.insertNode(textNode);
      const newRange = document.createRange();
      newRange.selectNode(textNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    selectRteTextColor("auto");
    selectRteHighlight("none");
  });
}

// ── Color picker ──────────────────────────────────────────────────────────────
function initColorPicker() {
  DOM.colorSwatches.querySelectorAll(".swatch").forEach(s => {
    s.addEventListener("click", () => {
      DOM.colorSwatches.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
      s.classList.add("active");
      State.selectedColor = s.dataset.color;
    });
  });
}

// ── Char counters ─────────────────────────────────────────────────────────────
function initCharCounters() {
  DOM.noteTitle.addEventListener("input", () => {
    const n = DOM.noteTitle.value.length;
    DOM.titleCount.textContent = `${n}/60`;
    DOM.titleCount.classList.toggle("warn", n >= 50);
  });
  DOM.noteDesc.addEventListener("input", () => {
    const n = DOM.noteDesc.textContent.length;
    DOM.descCount.textContent = `${n}/600`;
    DOM.descCount.classList.toggle("warn", n >= 540);
    // Enforce max length
    if (n > 600) {
      document.execCommand("undo");
    }
  });
}

// ── Add note ──────────────────────────────────────────────────────────────────
async function addNote() {
  DOM.formError.hidden = true;
  const title       = DOM.noteTitle.value.trim();
  const descHtml    = DOM.noteDesc.innerHTML.trim();
  const description = DOM.noteDesc.textContent.trim(); // plain text for search

  if (!title)       { showFormError("Please enter a title for your note."); DOM.noteTitle.focus(); return; }
  if (!description) { showFormError("Please write something in your note."); DOM.noteDesc.focus(); return; }

  setLoading(DOM.submitBtn, true);
  try {
    const data = await API.post("/notes", {
      title, description, descHtml,
      color: State.selectedColor,
      font:  State.selectedFont,
    });
    if (!data.note) throw new Error("Server did not return the saved note.");

    State.notes.unshift(data.note);
    closeModal();
    renderNotes(State.notes);
    showToast("Note pinned to your wall! 📌", "success");
  } catch (err) {
    const msg = err.message.includes("fetch")
      ? "Cannot reach the server. Is it running?"
      : err.message || "Something went wrong.";
    showFormError(msg);
    setLoading(DOM.submitBtn, false);
  }
}

// ── Delete note ───────────────────────────────────────────────────────────────
async function deleteNote(id) {
  const card = DOM.notesGrid.querySelector(`[data-id="${id}"]`);
  if (card) card.classList.add("removing");
  try {
    await API.del(`/notes/${id}`);
    State.notes = State.notes.filter(n => n.id !== id);
    setTimeout(() => renderNotes(State.notes), 360);
    showToast("Note removed.", "info");
  } catch {
    if (card) card.classList.remove("removing");
    showToast("Could not delete the note. Try again.", "error");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PIN TO SCREEN  (Document Picture-in-Picture)
// ══════════════════════════════════════════════════════════════════════════════

const activePipWindows = new Map();

async function pinNoteToScreen(note) {
  if (activePipWindows.has(note.id)) {
    activePipWindows.get(note.id).close();
    activePipWindows.delete(note.id);
    updatePinBtn(note.id, false);
    showToast("Note unpinned from screen.", "info");
    return;
  }

  if (!window.documentPictureInPicture) {
    showToast("Screen pinning requires Chrome 116+ on desktop.", "error", 4500);
    return;
  }

  try {
    const h = Math.min(380, Math.max(200, 110 + Math.ceil(note.description.length / 2.6)));
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 320, height: h });

    const font    = note.font || "default";
    const isUrdu  = font === "nastaleeq";
    const family  = FONT_FAMILIES[font] || FONT_FAMILIES.default;

    // Fonts in PiP
    const fontLink = pipWindow.document.createElement("link");
    fontLink.rel  = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;500;600&family=Caveat:wght@400;600&family=Dancing+Script:wght@400;600&family=Courier+Prime&family=Noto+Nastaliq+Urdu:wght@400;500;700&display=swap";
    pipWindow.document.head.appendChild(fontLink);

    const style = pipWindow.document.createElement("style");
    style.textContent = `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html,body{width:100%;height:100%;font-family:'DM Sans',sans-serif;background:transparent;overflow:hidden;user-select:none}
      .card{width:100%;height:100%;background:${note.color};border-radius:14px;display:flex;flex-direction:column;position:relative;box-shadow:0 4px 24px rgba(0,0,0,.15);overflow:hidden}
      .card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.55),rgba(255,255,255,.1));pointer-events:none;border-radius:14px}
      .top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px;flex-shrink:0;gap:8px}
      .pin{font-size:.9rem;opacity:.6;flex-shrink:0}
      .dots{flex:1;display:flex;justify-content:center;gap:3px;opacity:.3}
      .dots span{width:3px;height:3px;border-radius:50%;background:rgba(0,0,0,.5);display:inline-block}
      .close-btn{width:22px;height:22px;border:none;background:rgba(0,0,0,.1);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:rgba(0,0,0,.55);flex-shrink:0;transition:.2s ease;font-family:'DM Sans',sans-serif;line-height:1}
      .close-btn:hover{background:rgba(224,92,110,.2);color:#c44858;transform:scale(1.1)}
      .body{flex:1;overflow-y:auto;padding:2px 16px 14px;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
      .body::-webkit-scrollbar{width:4px}.body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:99px}
      .title{font-family:${family};font-size:1rem;font-weight:700;color:#1A1A2E;line-height:${isUrdu?2:1.3};letter-spacing:-0.01em;word-break:break-word;margin-bottom:8px;${isUrdu?"direction:rtl;text-align:right;":""}}
      .divider{height:1px;background:rgba(0,0,0,.1);margin-bottom:10px}
      .desc{font-family:${family};font-size:.82rem;color:#3A3A5A;line-height:${isUrdu?2.2:1.65};word-break:break-word;white-space:pre-wrap;${isUrdu?"direction:rtl;text-align:right;":""}}
      .footer{padding:6px 16px 10px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-top:1px solid rgba(0,0,0,.07)}
      .time{font-size:.65rem;color:#9898A8;font-weight:500}
      .badge{font-size:.58rem;font-weight:700;letter-spacing:.07em;text-transform:${isUrdu?"none":"uppercase"};color:rgba(0,0,0,.3);background:rgba(0,0,0,.07);padding:2px 7px;border-radius:999px;${isUrdu?"font-family:"+family+";font-size:.75rem;direction:rtl;letter-spacing:0;":""}}
    `;
    pipWindow.document.head.appendChild(style);

    pipWindow.document.body.innerHTML = `
      <div class="card">
        <div class="top">
          <span class="pin">📌</span>
          <div class="dots"><span></span><span></span><span></span><span></span><span></span><span></span></div>
          <button class="close-btn" id="pipClose">✕</button>
        </div>
        <div class="body">
          <div class="title">${escapeHtml(note.title)}</div>
          <div class="divider"></div>
          <div class="desc">${escapeHtml(note.description)}</div>
        </div>
        <div class="footer">
          <span class="time">${formatTime(note.createdAt)}</span>
          <span class="badge">${isUrdu ? "نوٹ" : "Pinned"}</span>
        </div>
      </div>`;

    pipWindow.document.getElementById("pipClose").addEventListener("click", () => pipWindow.close());

    activePipWindows.set(note.id, pipWindow);
    updatePinBtn(note.id, true);
    showToast("Note floating on screen! 📌", "success");

    pipWindow.addEventListener("pagehide", () => {
      activePipWindows.delete(note.id);
      updatePinBtn(note.id, false);
    });
  } catch (err) {
    const msg = err.name === "NotAllowedError"
      ? "Permission denied. Please allow the popup and try again."
      : "Could not pin note: " + err.message;
    showToast(msg, "error", 4000);
  }
}

function updatePinBtn(noteId, active) {
  const btn = DOM.notesGrid.querySelector(`.note-float-btn[data-id="${noteId}"]`);
  if (!btn) return;
  btn.classList.toggle("active", active);
  btn.title = active ? "Unpin from screen" : "Float on screen";
}

// ══════════════════════════════════════════════════════════════════════════════
//  FILTERS, KEYBOARD, EVENTS
// ══════════════════════════════════════════════════════════════════════════════

function initFilters() {
  let timer;
  DOM.searchInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      State.searchQuery = DOM.searchInput.value.trim();
      renderNotes(State.notes);
    }, 250);
  });
  DOM.sortSelect.addEventListener("change", () => {
    State.sortOrder = DOM.sortSelect.value;
    renderNotes(State.notes);
  });
}

function initKeyboard() {
  document.addEventListener("keydown", e => {
    const modalOpen  = DOM.modalBackdrop.classList.contains("open");
    const deleteOpen = DOM.deleteBackdrop.classList.contains("open");

    if (e.key === "Escape") {
      if (deleteOpen) closeDeleteDialog();
      else if (modalOpen) closeModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      DOM.searchInput.focus(); DOM.searchInput.select();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "n" && !modalOpen) {
      e.preventDefault();
      openModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && modalOpen) {
      addNote();
    }
  });
}

function initBackdropClicks() {
  DOM.modalBackdrop.addEventListener("click", e => {
    if (e.target === DOM.modalBackdrop) closeModal();
  });
  DOM.deleteBackdrop.addEventListener("click", e => {
    if (e.target === DOM.deleteBackdrop) closeDeleteDialog();
  });
}

function initTimeRefresh() {
  setInterval(() => {
    DOM.notesGrid.querySelectorAll(".note-time").forEach(el => {
      const iso = el.getAttribute("datetime");
      if (iso) el.textContent = formatTime(iso);
    });
  }, 60_000);
}

function bindAppEvents() {
  DOM.fabBtn.addEventListener("click", openModal);
  DOM.modalClose.addEventListener("click", closeModal);
  DOM.cancelBtn.addEventListener("click", closeModal);
  DOM.submitBtn.addEventListener("click", addNote);

  DOM.deleteCancelBtn.addEventListener("click", closeDeleteDialog);
  DOM.deleteConfirmBtn.addEventListener("click", async () => {
    if (!State.pendingDeleteId) return;
    const id = State.pendingDeleteId;
    closeDeleteDialog();
    await deleteNote(id);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
  // Init UI components
  initRteToolbar();
  initColorPicker();
  initFontPicker();
  initCharCounters();
  initFilters();
  initKeyboard();
  initBackdropClicks();
  initTimeRefresh();
  bindAppEvents();

  // Load notes directly — no auth required
  await loadNotes();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
