"use strict";

const express        = require("express");
const { v4: uuidv4 } = require("uuid");
const path           = require("path");
const fs             = require("fs");

const app        = express();
const PORT       = process.env.PORT || 3000;
const DATA_DIR   = path.join(__dirname, "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8").trim();
      if (raw) { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    }
  } catch (e) { console.error(`Parse error ${path.basename(file)}:`, e.message); }
  return [];
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8"); }
  catch (e) { console.error(`Save error ${path.basename(file)}:`, e.message); }
}

let notesStore = loadJSON(NOTES_FILE);
console.log(`Loaded ${notesStore.length} note(s).`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/notes", (req, res) => {
  const sorted = [...notesStore].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, notes: sorted });
});

app.post("/api/notes", (req, res) => {
  const { title, description, descHtml, color, font } = req.body;
  if (!title || !title.trim())
    return res.status(400).json({ success: false, message: "Title is required." });
  if (!description || !description.trim())
    return res.status(400).json({ success: false, message: "Description is required." });
  const note = {
    id: uuidv4(),
    title: title.trim(), description: description.trim(),
    descHtml: descHtml || "",
    color: color || "#FFDEE9", font: font || "default",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  notesStore.push(note); saveJSON(NOTES_FILE, notesStore);
  console.log(`Note added: "${note.title}"`);
  res.status(201).json({ success: true, note });
});

app.delete("/api/notes/:id", (req, res) => {
  const idx = notesStore.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: "Note not found." });
  const [deleted] = notesStore.splice(idx, 1);
  saveJSON(NOTES_FILE, notesStore);
  res.json({ success: true, deleted });
});

app.patch("/api/notes/:id", (req, res) => {
  const note = notesStore.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ success: false, message: "Note not found." });
  const { title, description } = req.body;
  if (title !== undefined) note.title = title.trim();
  if (description !== undefined) note.description = description.trim();
  note.updatedAt = new Date().toISOString();
  saveJSON(NOTES_FILE, notesStore);
  res.json({ success: true, note });
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`\n  ✦ Sticky Wall → http://localhost:${PORT}\n`));
module.exports = app;
