require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./db');
const demoVerisiYukle = require('./seed');

// Veritabanı boşsa örnek verileri ve demo hesabı otomatik oluştur
// (deploy platformlarında dosya sistemi her yeni sürümde sıfırlanır)
demoVerisiYukle();

const SAYFA_BOYUTU = (() => {
    const n = Number.parseInt(process.env.PAGE_SIZE || '8', 10);
    return Number.isInteger(n) && n > 0 && n <= 100 ? n : 8;
})();

const TURLER = [
    'Roman', 'Bilim Kurgu', 'Fantastik', 'Biyografi',
    'Tarih', 'Felsefe', 'Kişisel Gelişim', 'Çocuk Kitabı', 'Diğer'
];

const GIRIS_HATALARI = new Set(['invalid', 'empty', 'format', 'auth', 'exists']);

class SqliteSessionStore extends session.Store {
    constructor(database) {
        super();
        this.db = database;
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid    TEXT PRIMARY KEY,
                sess   TEXT NOT NULL,
                expire INTEGER NOT NULL
            );
        `);
        this.db.prepare('DELETE FROM sessions WHERE expire <= ?').run(Date.now());
        this._get = this.db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
        this._set = this.db.prepare(`
            INSERT INTO sessions (sid, sess, expire) VALUES (@sid, @sess, @expire)
            ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire
        `);
        this._del = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
        this._touch = this.db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
    }

    get(sid, cb) {
        try {
            const row = this._get.get(sid);
            if (!row) return cb(null, null);
            if (row.expire <= Date.now()) {
                this._del.run(sid);
                return cb(null, null);
            }
            return cb(null, JSON.parse(row.sess));
        } catch (err) {
            return cb(err);
        }
    }

    set(sid, sess, cb) {
        try {
            this._set.run({
                sid,
                sess: JSON.stringify(sess),
                expire: cerezBitis(sess)
            });
            return cb(null);
        } catch (err) {
            return cb(err);
        }
    }

    destroy(sid, cb) {
        try {
            this._del.run(sid);
            return cb(null);
        } catch (err) {
            return cb(err);
        }
    }

    touch(sid, sess, cb) {
        try {
            this._touch.run(cerezBitis(sess), sid);
            return cb(null);
        } catch (err) {
            return cb(err);
        }
    }
}

function cerezBitis(sess) {
    const cookie = sess && sess.cookie;
    if (cookie && cookie.expires) {
        const zaman = new Date(cookie.expires).getTime();
        if (Number.isFinite(zaman)) return zaman;
    }
    const maxAge = cookie && Number.isFinite(cookie.maxAge) ? cookie.maxAge : 24 * 60 * 60 * 1000;
    return Date.now() + maxAge;
}

function yeniToken() {
    return crypto.randomBytes(32).toString('hex');
}

function tokenEsit(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const sol = Buffer.from(a);
    const sag = Buffer.from(b);
    if (sol.length !== sag.length) return false;
    return crypto.timingSafeEqual(sol, sag);
}

function katla(sutun) {
    let sql = sutun;
    const harfler = [
        ['İ', 'i'], ['I', 'ı'], ['Ş', 'ş'], ['Ğ', 'ğ'],
        ['Ü', 'ü'], ['Ö', 'ö'], ['Ç', 'ç']
    ];
    for (const [buyuk, kucuk] of harfler) {
        sql = `replace(${sql}, '${buyuk}', '${kucuk}')`;
    }
    return `lower(${sql})`;
}

function trKatla(metin) {
    return String(metin).toLocaleLowerCase('tr-TR');
}

function likeDeseni(metin) {
    const katlanmis = trKatla(metin.trim()).replace(/[\\%_]/g, (ch) => `\\${ch}`);
    return `%${katlanmis}%`;
}

function temizMetin(value, min, max) {
    if (typeof value !== 'string') return null;
    const metin = value.trim();
    if (metin.length < min || metin.length > max) return null;
    if (/[\u0000-\u001F]/.test(metin)) return null;
    return metin;
}

function yayinYiliDogrula(value) {
    const metin = String(value ?? '').trim();
    if (!/^\d{4}$/.test(metin)) return null;
    const yil = Number(metin);
    const ustSinir = new Date().getFullYear() + 1;
    if (yil < 1000 || yil > ustSinir) return null;
    return yil;
}

function kitapDogrula(ad, yazar, tur, yayinYili) {
    const temizAd = temizMetin(ad, 2, 200);
    const temizYazar = temizMetin(yazar, 2, 100);
    const yil = yayinYiliDogrula(yayinYili);
    if (!temizAd || !temizYazar || !TURLER.includes(tur) || yil === null) return null;
    return { ad: temizAd, yazar: temizYazar, tur, yayinYili: yil };
}

function mesajDogrula(ad, soyad, mesaj) {
    const temizAd = temizMetin(ad, 2, 50);
    const temizSoyad = temizMetin(soyad, 2, 50);
    const temizMesaj = temizMetin(mesaj, 10, 1000);
    if (!temizAd || !temizSoyad || !temizMesaj) return null;
    return { ad: temizAd, soyad: temizSoyad, mesaj: temizMesaj };
}

function sayfaNo(value) {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : 1;
}

function guvenliYol(value) {
    if (typeof value !== 'string') return '/';
    if (value.length === 0 || value.length > 200) return '/';
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
    if (value.includes('\\') || value.includes('://')) return '/';
    if (
        value === '/login' || value.startsWith('/login?') ||
        value === '/register' || value.startsWith('/register?') ||
        value === '/logout' || value.startsWith('/logout?')
    ) {
        return '/';
    }
    return value;
}

function girisHatasi(value) {
    return typeof value === 'string' && GIRIS_HATALARI.has(value) ? value : '';
}

function girisAdresi({ error, success, form, next } = {}) {
    const params = new URLSearchParams();
    const hata = girisHatasi(error);
    if (hata) params.set('error', hata);
    if (success === 'registered') params.set('success', 'registered');
    if (form === 'register') params.set('form', 'register');
    const hedef = guvenliYol(next);
    if (hedef !== '/') params.set('next', hedef);
    const qs = params.toString();
    return qs ? `/login?${qs}` : '/login';
}

function kitapFormu(body = {}) {
    return {
        ad: typeof body.ad === 'string' ? body.ad : '',
        yazar: typeof body.yazar === 'string' ? body.yazar : '',
        tur: typeof body.tur === 'string' ? body.tur : '',
        yayinYili: body.yayinYili != null ? String(body.yayinYili) : ''
    };
}

function kitapListesi(search, page) {
    const params = [];
    let where = '';
    if (search) {
        const terim = likeDeseni(search);
        where = `WHERE ${katla('ad')} LIKE ? ESCAPE '\\' OR ${katla('yazar')} LIKE ? ESCAPE '\\' OR ${katla('tur')} LIKE ? ESCAPE '\\'`;
        params.push(terim, terim, terim);
    }

    const total = db.prepare(`SELECT COUNT(*) AS adet FROM books ${where}`).get(...params).adet;
    const totalPages = Math.max(1, Math.ceil(total / SAYFA_BOYUTU));
    const current = Math.min(Math.max(page, 1), totalPages);
    const rows = db.prepare(
        `SELECT * FROM books ${where} ORDER BY id LIMIT ? OFFSET ?`
    ).all(...params, SAYFA_BOYUTU, (current - 1) * SAYFA_BOYUTU);

    return { rows, total, totalPages, page: current };
}

function satirdanKitap(row) {
    return {
        id: row.id,
        ad: row.ad,
        yazar: row.yazar,
        tur: row.tur,
        yayinYili: row.yayin_yili
    };
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 50 }));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

app.use(session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET || 'gelistirme-icin-varsayilan-anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = yeniToken();
    }
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.user = req.session.user || null;
    res.locals.turler = TURLER;
    next();
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.use(express.static(path.join(__dirname, 'public')));

function girisGerekli(req, res, next) {
    if (req.session.user) return next();
    return res.redirect(girisAdresi({ error: 'auth', next: req.originalUrl }));
}

function csrfKontrol(req, res, next) {
    const token = req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '';
    if (!req.session || !tokenEsit(token, req.session.csrfToken)) {
        return res.status(403).render('404', {
            currentPage: '',
            title: '403 - İşlem Reddedildi',
            statusCode: 403
        });
    }
    return next();
}

app.get('/', (req, res) => {
    const ozet = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM books) AS kitapSayisi,
            (SELECT COUNT(DISTINCT yazar) FROM books) AS yazarSayisi
    `).get();

    res.render('home', {
        currentPage: 'home',
        title: 'Ana Sayfa',
        ozet
    });
});

app.get('/books', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const istenen = sayfaNo(req.query.page);
    const liste = kitapListesi(search, istenen);
    const success = ['added', 'updated', 'deleted'].includes(req.query.success) ? req.query.success : null;

    if (istenen !== liste.page) {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (liste.page > 1) params.set('page', String(liste.page));
        if (success) params.set('success', success);
        const qs = params.toString();
        return res.redirect(qs ? `/books?${qs}` : '/books');
    }

    res.render('index', {
        books: liste.rows.map(satirdanKitap),
        currentPage: 'books',
        title: 'Kitap Listesi',
        searchQuery: search,
        page: liste.page,
        totalPages: liste.totalPages,
        totalBooks: liste.total,
        success
    });
});

app.get('/add-book', girisGerekli, (req, res) => {
    res.render('add-book', {
        currentPage: 'add',
        title: 'Kitap Ekle',
        error: null,
        form: { ad: '', yazar: '', tur: '', yayinYili: '' }
    });
});

app.post('/add-book', girisGerekli, csrfKontrol, (req, res) => {
    const form = kitapFormu(req.body);
    const kitap = kitapDogrula(form.ad, form.yazar, form.tur, form.yayinYili);

    if (!kitap) {
        return res.status(400).render('add-book', {
            currentPage: 'add',
            title: 'Kitap Ekle',
            error: 'invalid',
            form
        });
    }

    db.prepare('INSERT INTO books (ad, yazar, tur, yayin_yili) VALUES (?, ?, ?, ?)')
        .run(kitap.ad, kitap.yazar, kitap.tur, kitap.yayinYili);

    res.redirect('/books?success=added');
});

app.post('/delete/:id', girisGerekli, csrfKontrol, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isInteger(id)) {
        db.prepare('DELETE FROM books WHERE id = ?').run(id);
    }

    const params = new URLSearchParams();
    params.set('success', 'deleted');
    if (typeof req.body.search === 'string' && req.body.search.trim()) {
        params.set('search', req.body.search.trim().slice(0, 100));
    }
    const page = sayfaNo(req.body.page);
    if (page > 1) params.set('page', String(page));
    res.redirect(`/books?${params.toString()}`);
});

app.get('/edit/:id', girisGerekli, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const row = Number.isInteger(id)
        ? db.prepare('SELECT * FROM books WHERE id = ?').get(id)
        : undefined;

    if (!row) return res.redirect('/books');

    res.render('edit-book', {
        book: satirdanKitap(row),
        currentPage: 'books',
        title: 'Kitap Düzenle',
        error: null
    });
});

app.post('/edit/:id', girisGerekli, csrfKontrol, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const mevcut = Number.isInteger(id)
        ? db.prepare('SELECT id FROM books WHERE id = ?').get(id)
        : undefined;

    if (!mevcut) return res.redirect('/books');

    const form = kitapFormu(req.body);
    const kitap = kitapDogrula(form.ad, form.yazar, form.tur, form.yayinYili);

    if (!kitap) {
        return res.status(400).render('edit-book', {
            book: { id, ...form },
            currentPage: 'books',
            title: 'Kitap Düzenle',
            error: 'invalid'
        });
    }

    db.prepare('UPDATE books SET ad = ?, yazar = ?, tur = ?, yayin_yili = ? WHERE id = ?')
        .run(kitap.ad, kitap.yazar, kitap.tur, kitap.yayinYili, id);

    res.redirect('/books?success=updated');
});

app.get('/about', (req, res) => {
    res.render('about', {
        currentPage: 'about',
        title: 'Hakkımızda'
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', {
        currentPage: 'contact',
        title: 'İletişim',
        success: req.query.success === 'sent',
        error: null,
        form: { ad: '', soyad: '', mesaj: '' }
    });
});

app.post('/contact', csrfKontrol, (req, res) => {
    const form = {
        ad: typeof req.body.ad === 'string' ? req.body.ad : '',
        soyad: typeof req.body.soyad === 'string' ? req.body.soyad : '',
        mesaj: typeof req.body.mesaj === 'string' ? req.body.mesaj : ''
    };
    const mesaj = mesajDogrula(form.ad, form.soyad, form.mesaj);

    if (!mesaj) {
        return res.status(400).render('contact', {
            currentPage: 'contact',
            title: 'İletişim',
            success: false,
            error: 'invalid',
            form
        });
    }

    db.prepare('INSERT INTO messages (ad, soyad, mesaj) VALUES (?, ?, ?)')
        .run(mesaj.ad, mesaj.soyad, mesaj.mesaj);

    res.redirect('/contact?success=sent');
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.redirect(girisAdresi({
        form: 'register',
        error: req.query.error,
        next: req.query.next
    }));
});

app.post('/register', csrfKontrol, (req, res) => {
    if (req.session.user) return res.redirect('/');

    const next = req.body.next;
    const ad = typeof req.body.kullaniciAdi === 'string' ? req.body.kullaniciAdi.trim() : '';
    const parola = typeof req.body.sifre === 'string' ? req.body.sifre.trim() : '';

    if (!ad || !parola) {
        return res.redirect(girisAdresi({ error: 'empty', form: 'register', next }));
    }
    if (
        ad.length < 3 || ad.length > 50 ||
        parola.length < 4 || parola.length > 72 ||
        /[\u0000-\u001F]/.test(ad) || /[\u0000-\u001F]/.test(parola)
    ) {
        return res.redirect(girisAdresi({ error: 'format', form: 'register', next }));
    }

    const mevcut = db.prepare(`SELECT id FROM users WHERE ${katla('kullanici_adi')} = ?`).get(trKatla(ad));
    if (mevcut) {
        return res.redirect(girisAdresi({ error: 'exists', form: 'register', next }));
    }

    try {
        const sifreHash = bcrypt.hashSync(parola, 10);
        db.prepare('INSERT INTO users (kullanici_adi, sifre_hash) VALUES (?, ?)').run(ad, sifreHash);
    } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
            return res.redirect(girisAdresi({ error: 'exists', form: 'register', next }));
        }
        throw err;
    }

    res.redirect(girisAdresi({ success: 'registered', next }));
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', {
        currentPage: 'login',
        title: 'Giriş Yap / Kayıt Ol',
        error: girisHatasi(req.query.error) || null,
        success: req.query.success === 'registered' ? 'registered' : null,
        nextPath: guvenliYol(typeof req.query.next === 'string' ? req.query.next : '')
    });
});

app.post('/login', csrfKontrol, (req, res, next) => {
    if (req.session.user) return res.redirect('/');

    const nextUrl = req.body.next;
    const ad = typeof req.body.kullaniciAdi === 'string' ? req.body.kullaniciAdi.trim() : '';
    const parola = typeof req.body.sifre === 'string' ? req.body.sifre.trim() : '';

    if (!ad || !parola) {
        return res.redirect(girisAdresi({ error: 'empty', next: nextUrl }));
    }

    const user = db.prepare(`SELECT * FROM users WHERE ${katla('kullanici_adi')} = ?`).get(trKatla(ad));
    if (!user || !bcrypt.compareSync(parola, user.sifre_hash)) {
        return res.redirect(girisAdresi({ error: 'invalid', next: nextUrl }));
    }

    const hedef = guvenliYol(typeof nextUrl === 'string' ? nextUrl : '');
    const adKayit = user.kullanici_adi;

    req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = adKayit;
        req.session.csrfToken = yeniToken();
        req.session.save((saveErr) => {
            if (saveErr) return next(saveErr);
            res.redirect(hedef);
        });
    });
});

function cikis(req, res) {
    req.session.destroy((err) => {
        if (err) console.error('Session destroy hatası:', err);
        res.redirect('/');
    });
}

app.post('/logout', csrfKontrol, cikis);
app.get('/logout', cikis);

app.use((req, res) => {
    res.status(404).render('404', {
        currentPage: '',
        title: '404 - Sayfa Bulunamadı',
        statusCode: 404
    });
});

app.use((err, req, res, next) => {
    console.error('Sunucu hatası:', err);
    if (res.headersSent) return next(err);
    res.status(500).render('404', {
        currentPage: '',
        title: '500 - Sunucu Hatası',
        statusCode: 500
    });
});

if (require.main === module) {
    if (!process.env.SESSION_SECRET) {
        console.warn('Uyarı: SESSION_SECRET tanımlı değil. .env dosyasına uzun rastgele bir anahtar yazın.');
    }

    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
        console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
    });

    server.on('error', (err) => {
        console.error('Sunucu başlatılamadı:', err.message);
        process.exit(1);
    });

    const kapat = () => {
        server.close(() => {
            db.close();
            process.exit(0);
        });
    };
    process.on('SIGINT', kapat);
    process.on('SIGTERM', kapat);
}

module.exports = app;
