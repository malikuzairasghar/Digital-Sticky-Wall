const express      = require("express");
const session      = require("express-session");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
const path         = require("path");
const fs           = require("fs");

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "notes.json");

const USER_COOKIE    = "sw_uid";
const COOKIE_SECRET  = "sticky-wall-cookie-secret-xK9mP2";
const SESSION_SECRET = "sticky-wall-session-secret-yL7nQ5";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("Created data/ directory.");
}

function loadNotes() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8").trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error("Could not parse notes.json, starting fresh:", err.message);
  }
  return [];
}

function saveNotes(notes) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save notes:", err.message);
  }
}

let notesStore = loadNotes();
console.log("Loaded " + notesStore.length + " note(s) from disk.");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: COOKIE_MAX_AGE, httpOnly: true, sameSite: "lax" },
}));

app.use(express.static(path.join(__dirname, "public")));

function ensureUserId(req, res, next) {
  if (req.session.userId) return next();

  const cookieId = req.signedCookies[USER_COOKIE];
  if (cookieId) {
    req.session.userId    = cookieId;
    req.session.createdAt = new Date().toISOString();
    console.log("Session restored from cookie: " + cookieId.slice(0, 8));
    return next();
  }

  const newId = uuidv4();
  req.session.userId    = newId;
  req.session.createdAt = new Date().toISOString();

  res.cookie(USER_COOKIE, newId, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    signed: true,
    sameSite: "lax",
  });

  console.log("New user: " + newId.slice(0, 8));
  next();
}

app.use(ensureUserId);

app.get("/api/session", (req, res) => {
  res.json({
    userId:     req.session.userId,
    createdAt:  req.session.createdAt,
    notesCount: notesStore.filter((n) => n.userId === req.session.userId).length,
  });
});

app.get("/api/notes", (req, res) => {
  const userNotes = notesStore
    .filter((n) => n.userId === req.session.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, notes: userNotes });
});

app.post("/api/notes", (req, res) => {
  const { title, description, color } = req.body;

  if (!title || !title.trim())
    return res.status(400).json({ success: false, message: "Title is required." });
  if (!description || !description.trim())
    return res.status(400).json({ success: false, message: "Description is required." });

  const note = {
    id:          uuidv4(),
    userId:      req.session.userId,
    title:       title.trim(),
    description: description.trim(),
    color:       color || pickColor(),
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  notesStore.push(note);
  saveNotes(notesStore);

  console.log('Note saved: "' + note.title + '" (user ' + note.userId.slice(0, 8) + ")");
  res.status(201).json({ success: true, note });
});

app.delete("/api/notes/:id", (req, res) => {
  const idx = notesStore.findIndex(
    (n) => n.id === req.params.id && n.userId === req.session.userId
  );
  if (idx === -1)
    return res.status(404).json({ success: false, message: "Note not found." });

  const [deleted] = notesStore.splice(idx, 1);
  saveNotes(notesStore);
  res.json({ success: true, deleted });
});

app.patch("/api/notes/:id", (req, res) => {
  const note = notesStore.find(
    (n) => n.id === req.params.id && n.userId === req.session.userId
  );
  if (!note)
    return res.status(404).json({ success: false, message: "Note not found." });

  const { title, description } = req.body;
  if (title !== undefined)       note.title       = title.trim();
  if (description !== undefined) note.description = description.trim();
  note.updatedAt = new Date().toISOString();

  saveNotes(notesStore);
  res.json({ success: true, note });
});

app.get("/api/stats", (req, res) => {
  const userNotes = notesStore.filter((n) => n.userId === req.session.userId);
  res.json({ success: true, total: userNotes.length });
});


const NOTE_COLORS = [
  "#FFDEE9","#B5EAD7","#C7CEEA","#FFE0B2",
  "#E8D5F5","#D4F1F4","#FFDAC1","#E2F0CB",
];
let colorIndex = 0;
function pickColor() {
  return NOTE_COLORS[(colorIndex++) % NOTE_COLORS.length];
}

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("\n  Sticky Wall running at http://localhost:" + PORT + "\n");
});

module.exports = app;
