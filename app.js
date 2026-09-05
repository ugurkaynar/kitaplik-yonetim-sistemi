require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./db');
const demoVerisiYukle = require('./seed');

// Veritabanı boşsa örnek verileri ve demo hesabı otomatik oluştur
// (deploy platformlarında dosya sistemi her yeni sürümde sıfırlanır)
demoVerisiYukle();

const app = express();

// View engine ayarı - EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware (gizli anahtar .env dosyasından okunur)
app.use(session({
    secret: process.env.SESSION_SECRET || 'gelistirme-icin-varsayilan-anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // HTTPS altında çalışırken true yapılmalı
        httpOnly: true, // JavaScript'in çereze erişimini engelle (XSS koruması)
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// Kullanıcı bilgisini tüm sayfalarda erişilebilir yap (session'dan hemen sonra)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Static dosyalar için public klasörü
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------- Yardımcılar ------------------------- */

// Sadece giriş yapan kullanıcıların erişebileceği rotalar için middleware
function girisGerekli(req, res, next) {
    if (req.session.user) {
        return next();
    }
    return res.redirect('/login?error=auth');
}

// Geçerli kitap türleri (form ile aynı liste)
const TURLER = [
    'Roman', 'Bilim Kurgu', 'Fantastik', 'Biyografi',
    'Tarih', 'Felsefe', 'Kişisel Gelişim', 'Çocuk Kitabı', 'Diğer'
];

// Kitap formu için sunucu tarafı validasyon
function kitapDogrula(ad, yazar, tur, yayinYili) {
    if (!ad || ad.trim().length < 2 || ad.trim().length > 200) return false;
    if (!yazar || yazar.trim().length < 2 || yazar.trim().length > 100) return false;
    if (!TURLER.includes(tur)) return false;
    const yil = Number.parseInt(yayinYili, 10);
    if (!Number.isInteger(yil) || yil < 1000 || yil > new Date().getFullYear() + 1) return false;
    return true;
}

// DB satırını görünüm modeline çevir
function satirdanKitap(row) {
    return {
        id: row.id,
        ad: row.ad,
        yazar: row.yazar,
        tur: row.tur,
        yayinYili: row.yayin_yili
    };
}

/* ------------------------- Kitap Rotaları ------------------------- */

// Ana sayfa
app.get('/', (req, res) => {
    res.render('home', {
        currentPage: 'home',
        title: 'Ana Sayfa',
        user: res.locals.user
    });
});

// Kitap listesi sayfası (herkese açık; arama destekli)
app.get('/books', (req, res) => {
    const { search } = req.query;
    let rows;

    if (search && search.trim() !== '') {
        const terim = `%${search.trim()}%`;
        rows = db.prepare(
            'SELECT * FROM books WHERE lower(ad) LIKE lower(?) OR lower(yazar) LIKE lower(?) ORDER BY id'
        ).all(terim, terim);
    } else {
        rows = db.prepare('SELECT * FROM books ORDER BY id').all();
    }

    res.render('index', {
        books: rows.map(satirdanKitap),
        currentPage: 'books',
        title: 'Kitap Listesi',
        searchQuery: search || '',
        user: res.locals.user
    });
});

// Yeni kitap ekleme sayfası (GET) - giriş gerektirir
app.get('/add-book', girisGerekli, (req, res) => {
    res.render('add-book', {
        currentPage: 'add',
        title: 'Kitap Ekle',
        error: req.query.error || null,
        user: res.locals.user
    });
});

// Yeni kitap ekleme işlemi (POST) - giriş gerektirir
app.post('/add-book', girisGerekli, (req, res) => {
    const { ad, yazar, tur, yayinYili } = req.body;

    // Sunucu tarafı validasyon
    if (!kitapDogrula(ad, yazar, tur, yayinYili)) {
        return res.redirect('/add-book?error=invalid');
    }

    db.prepare('INSERT INTO books (ad, yazar, tur, yayin_yili) VALUES (?, ?, ?, ?)')
        .run(ad.trim(), yazar.trim(), tur, Number.parseInt(yayinYili, 10));

    res.redirect('/books');
});

// Kitap silme (POST) - giriş gerektirir
app.post('/delete/:id', girisGerekli, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);

    if (Number.isInteger(id)) {
        db.prepare('DELETE FROM books WHERE id = ?').run(id);
    }

    res.redirect('/books');
});

// Kitap düzenleme sayfası (GET) - giriş gerektirir
app.get('/edit/:id', girisGerekli, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const row = Number.isInteger(id)
        ? db.prepare('SELECT * FROM books WHERE id = ?').get(id)
        : undefined;

    if (!row) {
        return res.redirect('/books');
    }

    res.render('edit-book', {
        book: satirdanKitap(row),
        currentPage: 'add',
        title: 'Kitap Düzenle',
        error: req.query.error || null,
        user: res.locals.user
    });
});

// Kitap güncelleme işlemi (POST) - giriş gerektirir
app.post('/edit/:id', girisGerekli, (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const { ad, yazar, tur, yayinYili } = req.body;

    const mevcut = Number.isInteger(id)
        ? db.prepare('SELECT id FROM books WHERE id = ?').get(id)
        : undefined;

    if (!mevcut) {
        return res.redirect('/books');
    }

    // Sunucu tarafı validasyon
    if (!kitapDogrula(ad, yazar, tur, yayinYili)) {
        return res.redirect(`/edit/${id}?error=invalid`);
    }

    db.prepare('UPDATE books SET ad = ?, yazar = ?, tur = ?, yayin_yili = ? WHERE id = ?')
        .run(ad.trim(), yazar.trim(), tur, Number.parseInt(yayinYili, 10), id);

    res.redirect('/books');
});

/* ------------------------- Genel Sayfalar ------------------------- */

// Hakkımızda sayfası
app.get('/about', (req, res) => {
    res.render('about', {
        currentPage: 'about',
        title: 'Hakkımızda',
        user: res.locals.user
    });
});

// İletişim sayfası
app.get('/contact', (req, res) => {
    res.render('contact', {
        currentPage: 'contact',
        title: 'İletişim',
        user: res.locals.user
    });
});

/* ------------------------- Kullanıcı Rotaları ------------------------- */

// Kayıt sayfası (GET) - kayıt formu login sayfasındaki collapse içinde
app.get('/register', (req, res) => {
    res.redirect('/login?error=' + (req.query.error || ''));
});

// Kayıt işlemi (POST)
app.post('/register', (req, res) => {
    const { kullaniciAdi, sifre } = req.body;

    // Validasyon: boş alanlar
    if (!kullaniciAdi || !sifre || kullaniciAdi.trim() === '' || sifre.trim() === '') {
        return res.redirect('/login?error=empty');
    }

    // Validasyon: kullanıcı adı 3-50, şifre en az 4 karakter
    if (kullaniciAdi.trim().length < 3 || kullaniciAdi.trim().length > 50 || sifre.trim().length < 4) {
        return res.redirect('/login?error=format');
    }

    // Kullanıcı adının zaten kullanılıp kullanılmadığını kontrol et
    const mevcut = db.prepare('SELECT id FROM users WHERE kullanici_adi = ?').get(kullaniciAdi.trim());
    if (mevcut) {
        return res.redirect('/login?error=exists');
    }

    // Şifreyi hash'leyerek sakla (bcrypt)
    const sifreHash = bcrypt.hashSync(sifre.trim(), 10);
    db.prepare('INSERT INTO users (kullanici_adi, sifre_hash) VALUES (?, ?)')
        .run(kullaniciAdi.trim(), sifreHash);

    res.redirect('/login?success=registered');
});

// Giriş sayfası (GET) - hem giriş hem kayıt formu burada
app.get('/login', (req, res) => {
    res.render('login', {
        currentPage: 'login',
        title: 'Giriş Yap / Kayıt Ol',
        error: req.query.error || null,
        success: req.query.success || null,
        user: res.locals.user
    });
});

// Giriş işlemi (POST)
app.post('/login', (req, res) => {
    const { kullaniciAdi, sifre } = req.body;

    // Validasyon: boş alanlar
    if (!kullaniciAdi || !sifre || kullaniciAdi.trim() === '' || sifre.trim() === '') {
        return res.redirect('/login?error=empty');
    }

    // Kullanıcıyı veritabanından bul ve şifreyi bcrypt ile karşılaştır
    const user = db.prepare('SELECT * FROM users WHERE kullanici_adi = ?').get(kullaniciAdi.trim());

    if (!user || !bcrypt.compareSync(sifre.trim(), user.sifre_hash)) {
        return res.redirect('/login?error=invalid');
    }

    // Başarılı giriş - session'a kullanıcı adını kaydet
    req.session.user = user.kullanici_adi;

    res.redirect('/');
});

// Çıkış (Logout)
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy hatası:', err);
        }
        res.redirect('/');
    });
});

/* ------------------------- Hata Yönetimi ------------------------- */

// 404 middleware - tüm rotalardan sonra çalışır
app.use((req, res) => {
    res.status(404).render('404', {
        currentPage: '',
        title: '404 - Sayfa Bulunamadı',
        user: res.locals.user
    });
});

// Beklenmeyen sunucu hataları için middleware
app.use((err, req, res, next) => {
    console.error('Sunucu hatası:', err);
    res.status(500).render('404', {
        currentPage: '',
        title: '500 - Sunucu Hatası',
        user: res.locals.user
    });
});

/* ------------------------- Başlat ------------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

module.exports = app;
