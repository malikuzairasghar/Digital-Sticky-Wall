# 🗒️ Digital Sticky Wall

A beautiful, full-stack sticky notes application with a glassmorphism UI, REST API, and session tracking.

---

## ✨ Features

- **Glassmorphism UI** with animated pastel note cards
- **Add / Delete** sticky notes with AJAX (no page reloads)
- **Persistent storage** — notes saved to `data/notes.json`
- **Session tracking** via `express-session` + signed cookies
- **Search** notes in real-time
- **Sort** by newest, oldest, or A→Z
- **8 pastel colour options** per note
- **Keyboard shortcuts**: `Ctrl+N` (new note), `Ctrl+K` (search), `Esc` (close)
- **Auto-refreshing timestamps** (e.g. "2 min ago")
- **Responsive** — works on all screen sizes
- **Different Fonts with colours and highlighting Feature**
- **Urdu Language Support**
- **Notes Pin Option(Display over apps)**
---

## 🗂️ Project Structure

```
digital-sticky-wall/
├── server.js               ← Express backend (REST API + sessions)
├── package.json
├── data/
│   └── notes.json          ← Persistent storage (auto-created)
└── public/
    ├── index.html          ← SPA shell
    ├── style.css           ← All styles (glassmorphism, animations)
    └── app.js              ← Frontend logic (fetch API, DOM, state)
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
cd digital-sticky-wall
npm install
```

### 2. Start the server

```bash
npm start
```

### 3. Open in browser

```
http://localhost:3000
```

---

## 🔌 REST API

| Method   | Endpoint          | Description                     |
|----------|-------------------|---------------------------------|
| `GET`    | `/api/notes`      | Get all notes for current user  |
| `POST`   | `/api/notes`      | Create a new note               |
| `DELETE` | `/api/notes/:id`  | Delete a note by ID             |
| `PATCH`  | `/api/notes/:id`  | Update a note's title/desc      |
| `GET`    | `/api/session`    | Get current session info        |
| `GET`    | `/api/stats`      | Get note stats for current user |

### POST /api/notes — Body

```json
{
  "title": "My Note",
  "description": "Note content here",
  "color": "#FFDEE9"
}
```

---

## 🍪 Sessions & Cookies

- Each visitor gets a unique `userId` via `express-session`
- A `sw_user` cookie is also set (accessible to frontend for display)
- Sessions persist for **7 days**
- Notes are **scoped to the session** — users only see their own notes

---

## 🛠️ Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript   |
| Backend   | Node.js + Express                 |
| Sessions  | express-session + cookie-parser   |
| IDs       | uuid v4                           |
| Storage   | In-memory + JSON file persistence |
| Fonts     | Playfair Display + DM Sans        |
