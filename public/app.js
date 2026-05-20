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
  async put(path, body) {
    const res = await fetch("/api" + path, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
        <button class="note-float-btn" data-id="${note.id}" title="Float on screen (in-page)" aria-label="Float note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
          </svg>
        </button>
        <button class="note-desktop-btn" data-id="${note.id}" title="Pin above all apps (desktop overlay)" aria-label="Pin above all apps">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="8 21 12 17 16 21"/>
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
  card.querySelector(".note-desktop-btn").addEventListener("click", e => {
    e.stopPropagation();
    pinNoteToDesktop(note);
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
//  FLOATING PINNED NOTES  (in-page draggable panels, multiple at once)
// ══════════════════════════════════════════════════════════════════════════════

const activeFloatingNotes = new Map(); // noteId → { el, noteData }
let   floatingZBase       = 9100;

function getFloatingLayer() {
  return document.getElementById("floatingNotesLayer");
}

function cascadePosition(index) {
  const base = { x: window.innerWidth - 310, y: 80 };
  return { x: base.x - index * 28, y: base.y + index * 32 };
}

function makeDraggable(el, handleEl) {
  let startX, startY, origLeft, origTop, dragging = false;

  handleEl.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    dragging = true;
    startX   = e.clientX;
    startY   = e.clientY;
    origLeft = parseInt(el.style.left) || 0;
    origTop  = parseInt(el.style.top)  || 0;
    el.classList.add("dragging");
    el.style.zIndex = ++floatingZBase;
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx  = e.clientX - startX;
    const dy  = e.clientY - startY;
    const maxX = window.innerWidth  - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;
    el.style.left = Math.min(maxX, Math.max(0, origLeft + dx)) + "px";
    el.style.top  = Math.min(maxY, Math.max(0, origTop  + dy)) + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
  });
}

function removeFloatingNote(noteId) {
  const entry = activeFloatingNotes.get(noteId);
  if (!entry) return;
  entry.el.classList.add("closing");
  setTimeout(() => {
    entry.el.remove();
    activeFloatingNotes.delete(noteId);
    updatePinBtn(noteId, false);
  }, 230);
}

function createFloatingNote(note) {
  const font   = note.font || "default";
  const isUrdu = font === "nastaleeq";
  const family = FONT_FAMILIES[font] || FONT_FAMILIES.default;

  const el = document.createElement("div");
  el.className    = "floating-note";
  el.dataset.fnId = note.id;
  el.style.background  = note.color;
  el.style.fontFamily  = family;
  el.style.zIndex      = ++floatingZBase;

  const { x, y } = cascadePosition(activeFloatingNotes.size);
  el.style.left = Math.min(x, window.innerWidth  - 290) + "px";
  el.style.top  = Math.min(y, window.innerHeight - 180) + "px";

  const descContent = note.descHtml
    ? sanitizeNoteHtml(note.descHtml)
    : escapeHtml(note.description || "");

  el.innerHTML = `
    <div class="fn-header">
      <span class="fn-pin">📌</span>
      <div class="fn-drag-dots">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="fn-actions">
        <button class="fn-btn fn-edit-btn" title="Edit note" aria-label="Edit note">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="fn-btn fn-close-btn" title="Unpin" aria-label="Close floating note">✕</button>
      </div>
    </div>
    <div class="fn-body">
      <div class="fn-title"${isUrdu ? ' dir="rtl"' : ""}>${escapeHtml(note.title)}</div>
      <div class="fn-divider"></div>
      <div class="fn-desc"${isUrdu ? ' dir="rtl"' : ""}>${descContent}</div>
    </div>
    <div class="fn-footer">
      <span class="fn-time">${formatTime(note.createdAt)}</span>
      <span class="fn-badge">Pinned</span>
    </div>`;

  const header    = el.querySelector(".fn-header");
  const editBtn   = el.querySelector(".fn-edit-btn");
  const closeBtn  = el.querySelector(".fn-close-btn");
  const descEl    = el.querySelector(".fn-desc");

  makeDraggable(el, header);

  closeBtn.addEventListener("click", () => {
    removeFloatingNote(note.id);
    showToast("Note unpinned.", "info");
  });

  // Bring to front on click
  el.addEventListener("mousedown", () => { el.style.zIndex = ++floatingZBase; });

  // ── Edit mode ──────────────────────────────────────────────────
  let editing = false;

  editBtn.addEventListener("click", () => {
    if (editing) return;
    editing = true;

    // Replace desc with textarea
    const textarea = document.createElement("textarea");
    textarea.className   = "fn-desc-edit";
    textarea.value       = note.description || "";
    if (isUrdu) textarea.dir = "rtl";
    descEl.replaceWith(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Replace edit btn with save + cancel
    editBtn.style.display = "none";
    const saveBtn = document.createElement("button");
    saveBtn.className = "fn-btn fn-save-btn";
    saveBtn.title     = "Save changes";
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className = "fn-btn fn-cancel-edit-btn";
    cancelEditBtn.title     = "Cancel edit";
    cancelEditBtn.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const actions = el.querySelector(".fn-actions");
    actions.insertBefore(saveBtn, closeBtn);
    actions.insertBefore(cancelEditBtn, closeBtn);

    function exitEdit(save) {
      editing = false;
      if (save) {
        const newText = textarea.value.trim();
        if (newText) {
          note.description = newText;
          note.descHtml    = escapeHtml(newText);
          // Update the State.notes array so search still works
          const stateNote = State.notes.find(n => n.id === note.id);
          if (stateNote) { stateNote.description = newText; stateNote.descHtml = escapeHtml(newText); }
          // Persist to server (best-effort)
          API.put(`/notes/${note.id}`, { description: newText, descHtml: escapeHtml(newText) })
            .catch(() => {});
          showToast("Note updated! ✏️", "success");
        }
      }
      const newDesc = document.createElement("div");
      newDesc.className = "fn-desc";
      if (isUrdu) newDesc.dir = "rtl";
      newDesc.innerHTML = sanitizeNoteHtml(note.descHtml || escapeHtml(note.description || ""));
      textarea.replaceWith(newDesc);
      saveBtn.remove();
      cancelEditBtn.remove();
      editBtn.style.display = "";
    }

    saveBtn.addEventListener("click",       () => exitEdit(true));
    cancelEditBtn.addEventListener("click", () => exitEdit(false));
    textarea.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exitEdit(true); }
      if (e.key === "Escape") { e.preventDefault(); exitEdit(false); }
    });
  });

  return el;
}

function pinNoteToScreen(note) {
  if (activeFloatingNotes.has(note.id)) {
    removeFloatingNote(note.id);
    showToast("Note unpinned.", "info");
    return;
  }

  const el = createFloatingNote(note);
  getFloatingLayer().appendChild(el);
  activeFloatingNotes.set(note.id, { el, noteData: note });
  updatePinBtn(note.id, true);
  showToast("Note floating on screen! 📌", "success");
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
//  DESKTOP OVERLAY  (Document Picture-in-Picture — always on top of all apps)
// ══════════════════════════════════════════════════════════════════════════════

const activePipWindows = new Map(); // noteId → pipWindow

async function pinNoteToDesktop(note) {
  // Toggle off if already open
  if (activePipWindows.has(note.id)) {
    try { activePipWindows.get(note.id).close(); } catch {}
    activePipWindows.delete(note.id);
    updateDesktopBtn(note.id, false);
    showToast("Note unpinned from desktop.", "info");
    return;
  }

  if (!window.documentPictureInPicture) {
    showToast("Desktop overlay requires Chrome 116+ or Edge 116+. Try updating your browser.", "error", 5500);
    return;
  }

  const font   = note.font || "default";
  const isUrdu = font === "nastaleeq";
  const family = FONT_FAMILIES[font] || FONT_FAMILIES.default;

  // Height scales with content length
  const contentH = Math.min(320, Math.max(140, 90 + Math.ceil((note.description || "").length / 2.8)));

  let pipWindow;
  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width:  300,
      height: contentH + 80,
      disallowReturnToOpener: false,
    });
  } catch (err) {
    const msg = err.name === "NotAllowedError"
      ? "Permission denied — click directly on the 🖥️ button and try again."
      : "Could not open desktop overlay: " + err.message;
    showToast(msg, "error", 5000);
    return;
  }

  /* ── Styles ──────────────────────────────────────────── */
  const style = pipWindow.document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: transparent; overflow: hidden;
    }
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;500;600&family=Caveat:wght@400;600&family=Dancing+Script:wght@400;600&family=Courier+Prime&family=Noto+Nastaliq+Urdu:wght@400;500;700&display=swap');

    .card {
      width: 100%; height: 100%;
      background: ${note.color};
      border-radius: 14px;
      display: flex; flex-direction: column;
      position: relative;
      box-shadow: 0 6px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.12);
      overflow: hidden;
    }
    .card::before {
      content: ''; position: absolute; inset: 0; border-radius: 14px;
      background: linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,.08));
      pointer-events: none;
    }

    /* Header */
    .top {
      display: flex; align-items: center;
      padding: 9px 10px 6px; gap: 6px; flex-shrink: 0;
      background: rgba(255,255,255,.28); backdrop-filter: blur(6px);
      border-bottom: 1px solid rgba(0,0,0,.07);
      cursor: default; user-select: none;
    }
    .pin { font-size: .85rem; opacity: .65; flex-shrink: 0; }
    .dots { flex: 1; display: flex; gap: 2px; align-items: center; opacity: .3; }
    .dots span { width: 3px; height: 3px; border-radius: 50%; background: rgba(0,0,0,.6); display: inline-block; }
    .top-btns { display: flex; gap: 4px; flex-shrink: 0; }
    .top-btn {
      width: 22px; height: 22px; border: none;
      background: rgba(0,0,0,.09); border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: .6rem; color: rgba(0,0,0,.5);
      transition: background .18s, color .18s, transform .15s;
      line-height: 1;
    }
    .top-btn:hover { transform: scale(1.15); }
    .top-btn.edit-btn:hover { background: rgba(100,149,237,.25); color: #3a7bd5; }
    .top-btn.close-btn:hover { background: rgba(224,92,110,.2); color: #c44858; }
    .top-btn.save-btn { background: rgba(39,174,96,.15); color: #27ae60; }
    .top-btn.save-btn:hover { background: rgba(39,174,96,.3); }
    .top-btn.cancel-btn:hover { background: rgba(0,0,0,.15); }

    /* Body */
    .body {
      flex: 1; overflow-y: auto; padding: 10px 14px 10px;
      scrollbar-width: thin; scrollbar-color: rgba(0,0,0,.15) transparent;
    }
    .body::-webkit-scrollbar { width: 4px; }
    .body::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 99px; }

    .title {
      font-family: ${family};
      font-size: .96rem; font-weight: 700; color: #1A1A2E;
      line-height: ${isUrdu ? 2 : 1.3};
      word-break: break-word; margin-bottom: 7px;
      ${isUrdu ? "direction:rtl; text-align:right;" : ""}
    }
    .divider { height: 1px; background: rgba(0,0,0,.1); margin-bottom: 8px; }
    .desc {
      font-family: ${family};
      font-size: .8rem; color: #1A1A2E;
      line-height: ${isUrdu ? 2.1 : 1.62};
      word-break: break-word; white-space: pre-wrap;
      ${isUrdu ? "direction:rtl; text-align:right;" : ""}
    }
    .desc-edit {
      width: 100%; min-height: 72px;
      border: 1.5px solid rgba(0,0,0,.15); border-radius: 8px;
      background: rgba(255,255,255,.55); backdrop-filter: blur(4px);
      padding: 7px 9px; font-size: .8rem; color: #1A1A2E;
      font-family: ${family}; line-height: 1.6;
      resize: vertical; outline: none;
      ${isUrdu ? "direction:rtl;" : ""}
    }
    .desc-edit:focus { border-color: rgba(100,149,237,.55); }

    /* Footer */
    .footer {
      padding: 5px 14px 9px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0; border-top: 1px solid rgba(0,0,0,.07);
    }
    .time { font-size: .62rem; color: #9898A8; font-weight: 500; }
    .badge {
      font-size: .54rem; font-weight: 700; letter-spacing: .07em;
      text-transform: ${isUrdu ? "none" : "uppercase"};
      color: rgba(0,0,0,.28); background: rgba(0,0,0,.07);
      padding: 2px 7px; border-radius: 999px;
      ${isUrdu ? "font-family:" + family + "; font-size:.72rem; direction:rtl; letter-spacing:0;" : ""}
    }

    /* Resize hint */
    .resize-hint {
      position: absolute; bottom: 2px; right: 4px;
      font-size: .48rem; color: rgba(0,0,0,.18);
      pointer-events: none; letter-spacing: .02em;
    }
  `;
  pipWindow.document.head.appendChild(style);

  /* ── Font preload ─────────────────────────────────────── */
  const fontLink = pipWindow.document.createElement("link");
  fontLink.rel  = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;500;600&family=Caveat:wght@400;600&family=Dancing+Script:wght@400;600&family=Courier+Prime&family=Noto+Nastaliq+Urdu:wght@400;500;700&display=swap";
  pipWindow.document.head.appendChild(fontLink);

  /* ── Initial HTML ─────────────────────────────────────── */
  const descContent = note.descHtml
    ? note.descHtml.replace(/<[^>]+>/g, "")   // strip HTML tags for PiP plain text
    : (note.description || "");

  pipWindow.document.body.innerHTML = `
    <div class="card">
      <div class="top">
        <span class="pin">📌</span>
        <div class="dots"><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="top-btns">
          <button class="top-btn edit-btn" id="editBtn" title="Edit note">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="top-btn close-btn" id="closeBtn" title="Unpin from desktop">✕</button>
        </div>
      </div>
      <div class="body">
        <div class="title">${escapeHtmlPip(note.title)}</div>
        <div class="divider"></div>
        <div class="desc" id="descView">${escapeHtmlPip(descContent)}</div>
      </div>
      <div class="footer">
        <span class="time">${formatTime(note.createdAt)}</span>
        <span class="badge">${isUrdu ? "نوٹ" : "Desktop Pin"}</span>
      </div>
      <span class="resize-hint">↗ drag edge to resize</span>
    </div>`;

  /* ── Close button ─────────────────────────────────────── */
  pipWindow.document.getElementById("closeBtn").addEventListener("click", () => {
    pipWindow.close();
  });

  /* ── Edit button ──────────────────────────────────────── */
  const editBtn  = pipWindow.document.getElementById("editBtn");
  const descView = pipWindow.document.getElementById("descView");
  let   editing  = false;

  editBtn.addEventListener("click", () => {
    if (editing) return;
    editing = true;

    const textarea = pipWindow.document.createElement("textarea");
    textarea.className = "desc-edit";
    textarea.value     = note.description || "";
    if (isUrdu) textarea.dir = "rtl";
    descView.replaceWith(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Swap edit btn with save + cancel
    editBtn.style.display = "none";

    const saveBtn = pipWindow.document.createElement("button");
    saveBtn.className = "top-btn save-btn";
    saveBtn.title     = "Save (Ctrl+Enter)";
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const cancelBtn = pipWindow.document.createElement("button");
    cancelBtn.className = "top-btn cancel-btn";
    cancelBtn.title     = "Cancel (Esc)";
    cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const topBtns = pipWindow.document.querySelector(".top-btns");
    topBtns.insertBefore(saveBtn, pipWindow.document.getElementById("closeBtn"));
    topBtns.insertBefore(cancelBtn, pipWindow.document.getElementById("closeBtn"));

    function exitEdit(save) {
      editing = false;
      if (save) {
        const newText = textarea.value.trim();
        if (newText) {
          note.description = newText;
          note.descHtml    = escapeHtmlPip(newText);
          const stateNote = State.notes.find(n => n.id === note.id);
          if (stateNote) { stateNote.description = newText; stateNote.descHtml = escapeHtmlPip(newText); }
          API.put(`/notes/${note.id}`, { description: newText, descHtml: escapeHtmlPip(newText) }).catch(() => {});
          // Refresh the wall card if visible
          renderNotes(State.notes);
          showToast("Note updated! ✏️", "success");
        }
      }
      const newDescView = pipWindow.document.createElement("div");
      newDescView.className = "desc";
      newDescView.id        = "descView";
      if (isUrdu) newDescView.dir = "rtl";
      newDescView.textContent = note.description || "";
      textarea.replaceWith(newDescView);
      saveBtn.remove(); cancelBtn.remove();
      editBtn.style.display = "";
    }

    saveBtn.addEventListener("click", () => exitEdit(true));
    cancelBtn.addEventListener("click", () => exitEdit(false));
    textarea.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); exitEdit(true); }
      if (e.key === "Escape") { e.preventDefault(); exitEdit(false); }
    });
  });

  /* ── Register & track ─────────────────────────────────── */
  activePipWindows.set(note.id, pipWindow);
  updateDesktopBtn(note.id, true);
  showToast("Note pinned above all apps! 🖥️", "success", 3200);

  pipWindow.addEventListener("pagehide", () => {
    activePipWindows.delete(note.id);
    updateDesktopBtn(note.id, false);
  });
}

// Simple HTML escape for use inside PiP window (no DOM available)
function escapeHtmlPip(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function updateDesktopBtn(noteId, active) {
  const btn = DOM.notesGrid.querySelector(`.note-desktop-btn[data-id="${noteId}"]`);
  if (!btn) return;
  btn.classList.toggle("active", active);
  btn.title = active ? "Unpin from desktop" : "Pin above all apps (desktop overlay)";
}

// ══════════════════════════════════════════════════════════════════════════════
//  VOICE TO TEXT  (Web Speech API)
// ══════════════════════════════════════════════════════════════════════════════

function initVoiceToText() {
  const voiceBtn   = document.getElementById("voiceBtn");
  const label      = document.getElementById("voiceBtnLabel");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceBtn.classList.add("unsupported");
    voiceBtn.title = "Voice input not supported in this browser (try Chrome)";
    label.textContent = "Not supported";
    return;
  }

  const recog = new SpeechRecognition();
  recog.continuous    = true;
  recog.interimResults= true;
  recog.lang          = "en-US";

  let isRecording   = false;
  let interimSpan   = null;
  let lastFinalText = "";

  recog.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    label.textContent = "Stop";
    voiceBtn.title    = "Stop dictation";

    // Insert a span for interim text
    DOM.noteDesc.focus();
    interimSpan = document.createElement("span");
    interimSpan.style.opacity = "0.45";
    interimSpan.style.fontStyle = "italic";
    DOM.noteDesc.appendChild(interimSpan);
  };

  recog.onresult = (e) => {
    let interim = "";
    let finalChunk = "";

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalChunk += transcript;
      } else {
        interim += transcript;
      }
    }

    if (finalChunk) {
      // Commit final text as a real text node before the interim span
      const textNode = document.createTextNode(finalChunk + " ");
      if (interimSpan && interimSpan.parentNode === DOM.noteDesc) {
        DOM.noteDesc.insertBefore(textNode, interimSpan);
      } else {
        DOM.noteDesc.appendChild(textNode);
      }
      lastFinalText += finalChunk + " ";
      // Update char counter
      const n = DOM.noteDesc.textContent.length;
      DOM.descCount.textContent = `${n}/600`;
      DOM.descCount.classList.toggle("warn", n >= 540);
    }

    if (interimSpan) interimSpan.textContent = interim;
  };

  recog.onerror = (e) => {
    if (e.error === "not-allowed") {
      showToast("Microphone access denied. Please allow mic in browser settings.", "error", 5000);
    } else if (e.error !== "no-speech") {
      showToast(`Voice error: ${e.error}`, "error");
    }
    stopRecording();
  };

  recog.onend = () => {
    if (isRecording) {
      // auto-restarted if user didn't click stop
    }
    stopRecording();
  };

  function stopRecording() {
    isRecording = false;
    voiceBtn.classList.remove("recording");
    label.textContent = "Dictate";
    voiceBtn.title = "Dictate note (voice to text)";
    if (interimSpan && interimSpan.parentNode) {
      // Replace interim span with finalised plain text if it still has content
      if (interimSpan.textContent.trim()) {
        const textNode = document.createTextNode(interimSpan.textContent + " ");
        interimSpan.replaceWith(textNode);
      } else {
        interimSpan.remove();
      }
      interimSpan = null;
    }
    lastFinalText = "";
  }

  voiceBtn.addEventListener("click", () => {
    if (voiceBtn.classList.contains("unsupported")) return;
    if (isRecording) {
      recog.stop();
    } else {
      // Detect Urdu font → use Urdu language
      recog.lang = State.selectedFont === "nastaleeq" ? "ur-PK" : "en-US";
      try { recog.start(); }
      catch { /* already started */ }
    }
  });
}



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
  initVoiceToText();
  bindAppEvents();

  // Load notes directly — no auth required
  await loadNotes();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
