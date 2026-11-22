# 📚 Library Management System — Kitaplık Yönetim Sistemi

A full-stack web application for managing a personal book library. Users can register, log in, and manage their book collection with full CRUD operations, search, and persistent storage.
> 🔗 **Live Demo:** [kitaplik-yonetim-sistemi.onrender.com](https://kitaplik-yonetim-sistemi.onrender.com) — demo account: `demo` / `demo1234`

## ✨ Features

- 🔐 **User authentication** — register & login with bcrypt-hashed passwords and session management
- 🛡️ **Route protection** — book management routes require authentication (custom middleware)
- 📖 **Full CRUD** — add, edit, delete and list books
- 🔎 **Search** — filter books by title, author, or genre (Turkish case-insensitive)
- 📄 **Pagination** — book list is split into pages
- ✅ **Server-side validation** — all form data validated on both client and server
- ✉️ **Contact form** — messages are stored in SQLite
- 💾 **Persistent storage** — SQLite database (WAL mode) for books, users, messages, and sessions
- 🎨 **Responsive UI** — Bootstrap 5 with custom styling, 403 / 404 / 500 pages

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (18+) |
| Framework | Express 5 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | express-session + bcryptjs |
| Template engine | EJS (with partials) |
| Frontend | Bootstrap 5, Bootstrap Icons |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer

### Installation

```bash
# 1) Clone the repository
git clone https://github.com/ugurkaynar/kitaplik-yonetim-sistemi.git
cd kitaplik-yonetim-sistemi

# 2) Install dependencies
npm install

# 3) Create your environment file
cp .env.example .env
#    Windows PowerShell: Copy-Item .env.example .env
#    → edit SESSION_SECRET with any long random string

# 4) (Optional) Load sample data + demo account
npm run seed

# 5) Start the server
npm start        # production
npm run dev      # development (auto-restart on changes)
```

Then open **http://localhost:3000** in your browser.

### Demo Account

After running `npm run seed`:

```
Username: demo
Password: demo1234
```

## 📁 Project Structure

```
├── app.js               # Express app: routes, middleware, validation
├── db.js                # SQLite connection & schema
├── seed.js              # Sample data loader
├── data/                # SQLite database file (gitignored)
├── views/
│   ├── partials/        # Header & footer components
│   ├── home.ejs         # Landing page
│   ├── index.ejs        # Book list + search
│   ├── add-book.ejs     # New book form
│   ├── edit-book.ejs    # Edit book form
│   ├── login.ejs        # Login & register forms
│   ├── about.ejs        # About page
│   ├── contact.ejs      # Contact form
│   └── 404.ejs          # 403 / 404 / 500 page
├── tests/app.test.js    # HTTP flow tests
└── public/              # Static assets
```

## 🔒 Security Notes

- Passwords are **never stored in plain text** — hashed with bcrypt (10 rounds, max 72 characters)
- Session cookie is `httpOnly` and `sameSite=lax` (protected from XSS cookie theft and most CSRF)
- Sessions are stored in SQLite and regenerated on login
- State-changing forms include a CSRF token
- All mutating book routes (`add / edit / delete`) require an authenticated session
- Book deletions use **POST** forms with a confirmation dialog
- Secrets (session key) are loaded from `.env`, which is gitignored
- SQL queries use **prepared statements** (protection against SQL injection)

## 🗺️ Roadmap

- [x] Pagination for large libraries
- [ ] Book cover images
- [ ] User-specific libraries (multi-tenant)
- [ ] REST API endpoints
- [ ] Deployment (Render / Railway)

## 📄 License

MIT — see the [LICENSE](LICENSE) file.
