"use strict";

const State = {
  notes: [],
  filtered: [],
  selectedColor: "#FFDEE9",
  pendingDeleteId: null,
  searchQuery: "",
  sortOrder: "newest",
  loading: false,
};

const $ = (id) => document.getElementById(id);

const DOM = {
  notesGrid:       $("notesGrid"),
  emptyState:      $("emptyState"),
  sessionLabel:    $("sessionLabel"),
  statsPill:       $("statsPill"),
  statsCount:      $("statsCount"),
  fabBtn:          $("fabBtn"),
  modalBackdrop:   $("modalBackdrop"),
  addModal:        $("addModal"),
  modalClose:      $("modalClose"),
  cancelBtn:       $("cancelBtn"),
  submitBtn:       $("submitBtn"),
  noteTitle:       $("noteTitle"),
  noteDesc:        $("noteDesc"),
  titleCount:      $("titleCount"),
  descCount:       $("descCount"),
  formError:       $("formError"),
  colorSwatches:   $("colorSwatches"),
  searchInput:     $("searchInput"),
  sortSelect:      $("sortSelect"),
  deleteBackdrop:  $("deleteBackdrop"),
  deleteCancelBtn: $("deleteCancelBtn"),
  deleteConfirmBtn:$("deleteConfirmBtn"),
  toastContainer:  $("toastContainer"),
};

const API = {
  base: "/api",

  async _parseJSON(res) {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
    
      throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`);
    }
  },

  async get(path) {
    const res = await fetch(this.base + path, { credentials: "include" });
    const data = await this._parseJSON(res);
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },

  async post(path, body) {
    const res = await fetch(this.base + path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await this._parseJSON(res);
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },

  async delete(path) {
    const res = await fetch(this.base + path, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await this._parseJSON(res);
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },
};

function showToast(message, type = "success", duration = 2800) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function createNoteCard(note, delay = 0) {
  const card = document.createElement("article");
  card.className = "note-card";
  card.dataset.id = note.id;
  card.style.background = note.color;
  card.style.animationDelay = `${delay}ms`;

  const isDark = isColorDark(note.color);
  if (isDark) card.classList.add("dark-note");

  card.innerHTML = `
    <div class="note-pin">📌</div>
    <div class="note-top">
      <h3 class="note-title">${escapeHtml(note.title)}</h3>
      <button class="note-delete-btn" data-id="${note.id}" aria-label="Delete note" title="Delete">✕</button>
    </div>
    <p class="note-desc">${escapeHtml(note.description)}</p>
    <div class="note-footer">
      <time class="note-time" datetime="${note.createdAt}" title="${new Date(note.createdAt).toLocaleString()}">${formatTime(note.createdAt)}</time>
      <span class="note-badge">Note</span>
    </div>
  `;

  card.querySelector(".note-delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openDeleteDialog(note.id);
  });

  return card;
}

function isColorDark(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderNotes(notes) {
  DOM.notesGrid.innerHTML = "";

  const display = applyFilters(notes);

  if (display.length === 0) {
    DOM.emptyState.hidden = false;
  } else {
    DOM.emptyState.hidden = true;
    display.forEach((note, i) => {
      const card = createNoteCard(note, i * 50);
      DOM.notesGrid.appendChild(card);
    });
  }

  updateStats(notes.length);
}

function applyFilters(notes) {
  let result = [...notes];

  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    result = result.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q)
    );
  }

  switch (State.sortOrder) {
    case "oldest":
      result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case "alpha":
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default: 
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return result;
}

function updateStats(count) {
  DOM.statsCount.textContent = count;
  DOM.statsPill.title = `${count} note${count !== 1 ? "s" : ""} on your wall`;
}

async function loadNotes() {
  try {
    const data = await API.get("/notes");
    State.notes = data.notes || [];
    renderNotes(State.notes);
  } catch (err) {
    console.error("Failed to load notes:", err);
    showToast("Could not load notes. Please refresh.", "error");
  }
}

async function loadSession() {
  try {
    const data = await API.get("/session");
    const short = data.userId ? data.userId.slice(0, 8) : "unknown";
    DOM.sessionLabel.textContent = `Session · ${short}`;
  } catch {
    DOM.sessionLabel.textContent = "Session · active";
  }
}

function openModal() {
  DOM.formError.hidden = true;
  DOM.noteTitle.value = "";
  DOM.noteDesc.value = "";
  DOM.titleCount.textContent = "0/60";
  DOM.descCount.textContent = "0/400";
  DOM.titleCount.classList.remove("warn");
  DOM.descCount.classList.remove("warn");
  DOM.submitBtn.disabled = false;
  DOM.submitBtn.querySelector(".btn-text").hidden = false;
  DOM.submitBtn.querySelector(".btn-loader").hidden = true;

  DOM.modalBackdrop.setAttribute("aria-hidden", "false");
  DOM.modalBackdrop.classList.add("open");
  setTimeout(() => DOM.noteTitle.focus(), 350);
  document.body.style.overflow = "hidden";
}

function closeModal() {
  DOM.modalBackdrop.classList.remove("open");
  DOM.modalBackdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function openDeleteDialog(id) {
  State.pendingDeleteId = id;
  DOM.deleteBackdrop.classList.add("open");
  DOM.deleteBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDeleteDialog() {
  DOM.deleteBackdrop.classList.remove("open");
  DOM.deleteBackdrop.setAttribute("aria-hidden", "true");
  State.pendingDeleteId = null;
  document.body.style.overflow = "";
}

async function addNote() {
  const title = DOM.noteTitle.value.trim();
  const description = DOM.noteDesc.value.trim();

  DOM.formError.hidden = true;

  if (!title) {
    showFormError("Please enter a title for your note.");
    DOM.noteTitle.focus();
    return;
  }
  if (!description) {
    showFormError("Please enter a description for your note.");
    DOM.noteDesc.focus();
    return;
  }

  DOM.submitBtn.disabled = true;
  DOM.submitBtn.querySelector(".btn-text").hidden = true;
  DOM.submitBtn.querySelector(".btn-loader").hidden = false;

  const resetBtn = () => {
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.querySelector(".btn-text").hidden = false;
    DOM.submitBtn.querySelector(".btn-loader").hidden = true;
  };

  try {
    const data = await API.post("/notes", {
      title,
      description,
      color: State.selectedColor,
    });

    if (!data || !data.note) {
      throw new Error("Server did not return the saved note. Is the server running?");
    }

    State.notes.unshift(data.note);
    closeModal();
    renderNotes(State.notes);
    showToast("Note pinned to your wall! 📌", "success");
  } catch (err) {
    resetBtn();
    const msg = err.message.includes("Failed to fetch")
      ? "Cannot reach the server. Make sure it is running on port 3000."
      : err.message || "Something went wrong. Please try again.";
    showFormError(msg);
  }
}

async function deleteNote(id) {
  const card = DOM.notesGrid.querySelector(`[data-id="${id}"]`);
  if (card) card.classList.add("removing");

  try {
    await API.delete(`/notes/${id}`);
    State.notes = State.notes.filter((n) => n.id !== id);
    setTimeout(() => renderNotes(State.notes), 360);
    showToast("Note removed.", "info");
  } catch (err) {
    if (card) card.classList.remove("removing");
    showToast("Could not delete the note. Try again.", "error");
  }
}

function showFormError(msg) {
  DOM.formError.textContent = msg;
  DOM.formError.hidden = false;
}

function initColorPicker() {
  DOM.colorSwatches.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      DOM.colorSwatches.querySelectorAll(".swatch").forEach((s) =>
        s.classList.remove("active")
      );
      swatch.classList.add("active");
      State.selectedColor = swatch.dataset.color;
    });
  });
}

function initCharCounters() {
  DOM.noteTitle.addEventListener("input", () => {
    const len = DOM.noteTitle.value.length;
    DOM.titleCount.textContent = `${len}/60`;
    DOM.titleCount.classList.toggle("warn", len >= 50);
  });

  DOM.noteDesc.addEventListener("input", () => {
    const len = DOM.noteDesc.value.length;
    DOM.descCount.textContent = `${len}/400`;
    DOM.descCount.classList.toggle("warn", len >= 360);
  });
}

function initTimeRefresh() {
  setInterval(() => {
    DOM.notesGrid.querySelectorAll(".note-time").forEach((el) => {
      const iso = el.getAttribute("datetime");
      if (iso) el.textContent = formatTime(iso);
    });
  }, 60_000); 
}

function initFilters() {
  let searchTimer;
  DOM.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
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
  document.addEventListener("keydown", (e) => {
  
    if (e.key === "Escape") {
      if (DOM.deleteBackdrop.classList.contains("open")) closeDeleteDialog();
      else if (DOM.modalBackdrop.classList.contains("open")) closeModal();
    }
  
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      DOM.searchInput.focus();
      DOM.searchInput.select();
    }
  
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      openModal();
    }
  
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && DOM.modalBackdrop.classList.contains("open")) {
      addNote();
    }
  });
}


function initBackdropClicks() {
  DOM.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === DOM.modalBackdrop) closeModal();
  });
  DOM.deleteBackdrop.addEventListener("click", (e) => {
    if (e.target === DOM.deleteBackdrop) closeDeleteDialog();
  });
}

function bindEvents() {
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

async function init() {
  initColorPicker();
  initCharCounters();
  initFilters();
  initKeyboard();
  initBackdropClicks();
  bindEvents();
  initTimeRefresh();

  await loadSession();
  await loadNotes();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
