// SQLite veritabanı bağlantısı ve şema yönetimi
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Veritabanı dosyasının oluşturulacağı klasör
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'kitaplik.db'));
db.pragma('journal_mode = WAL'); // Eşzamanlı okuma/yazmada güvenlik ve performans
db.pragma('foreign_keys = ON');

// Tablolar (yoksa oluşturulur)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        kullanici_adi TEXT NOT NULL UNIQUE,
        sifre_hash    TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS books (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ad         TEXT    NOT NULL,
        yazar      TEXT    NOT NULL,
        tur        TEXT    NOT NULL,
        yayin_yili INTEGER NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_books_ad    ON books(ad);
    CREATE INDEX IF NOT EXISTS idx_books_yazar ON books(yazar);
`);

module.exports = db;
