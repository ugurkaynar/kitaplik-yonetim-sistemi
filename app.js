const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');

const app = express();

// View engine ayarı - EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.user = null;

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: 'kitaplik-yonetim-sistemi-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // HTTPS için true yapılmalı
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

// Debug logging middleware - Tüm istekleri logla
app.use((req, res, next) => {
    console.log('İstek geldi:', req.method, req.url);
    next();
});

// Kitapları saklamak için dizi (geçici olarak memory'de)
let books = [];

// Kullanıcıları saklamak için dizi (geçici olarak memory'de)
let users = [];

// Ana sayfa rotası
app.get('/', (req, res) => {
    res.render('home', {
        currentPage: 'home',
        title: 'Ana Sayfa',
        user: res.locals.user
    });
});

// Kitap listesi sayfası
app.get('/books', (req, res) => {
    const { search } = req.query;
    let filteredBooks = books;

    if (search) {
        const searchLower = search.trim().toLowerCase();
        filteredBooks = books.filter(book => 
            (book.ad && book.ad.toLowerCase().includes(searchLower)) || 
            (book.yazar && book.yazar.toLowerCase().includes(searchLower))
        );
    }

    res.render('index', { 
        books: filteredBooks,
        currentPage: 'books',
        title: 'Kitap Listesi',
        searchQuery: search || '',
        user: res.locals.user
    });
});

// Yeni kitap ekleme sayfası (GET)
app.get('/add-book', (req, res) => {
    res.render('add-book', {
        currentPage: 'add',
        title: 'Kitap Ekle',
        user: res.locals.user
    });
});

// Yeni kitap ekleme işlemi (POST)
app.post('/add-book', (req, res) => {
    const { ad, yazar, tür, yayınYılı } = req.body;
    
    // Yeni kitap objesi oluştur
    const newBook = {
        id: books.length > 0 ? Math.max(...books.map(b => b.id)) + 1 : 1,
        ad: ad.trim(),
        yazar: yazar.trim(),
        tür: tür.trim(),
        yayınYılı: parseInt(yayınYılı)
    };
    
    // Diziye ekle
    books.push(newBook);
    
    // Ana sayfaya yönlendir
    res.redirect('/');
});

// Kitap silme rotası
app.get('/delete/:id', (req, res) => {
    const id = parseInt(req.params.id);
    
    // Kitabı diziden bul ve çıkar
    const bookIndex = books.findIndex(book => book.id === id);
    
    if (bookIndex !== -1) {
        books.splice(bookIndex, 1);
    }
    
    // Ana sayfaya yönlendir
    res.redirect('/');
});

// Kitap düzenleme sayfası (GET)
app.get('/edit/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const book = books.find(b => b.id === id);
    
    if (!book) {
        // Kitap bulunamadıysa ana sayfaya yönlendir
        return res.redirect('/');
    }
    
    res.render('edit-book', {
        book: book,
        currentPage: 'add',
        title: 'Kitap Düzenle',
        user: res.locals.user
    });
});

// Kitap güncelleme işlemi (POST)
app.post('/edit/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { ad, yazar, tür, yayınYılı } = req.body;
    
    // Kitabı dizide bul
    const bookIndex = books.findIndex(book => book.id === id);
    
    if (bookIndex !== -1) {
        // Kitap bilgilerini güncelle
        books[bookIndex] = {
            id: id,
            ad: ad.trim(),
            yazar: yazar.trim(),
            tür: tür.trim(),
            yayınYılı: parseInt(yayınYılı)
        };
    }
    
    // Ana sayfaya yönlendir
    res.redirect('/');
});

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

// Kayıt sayfası (GET) - Artık login sayfasında collapse içinde
app.get('/register', (req, res) => {
    console.log('✓ /register rotası çalıştı - login sayfasına yönlendiriliyor');
    // Login sayfasına yönlendir, kayıt formu otomatik açılacak
    res.redirect('/login?error=' + (req.query.error || ''));
});

// Kayıt işlemi (POST)
app.post('/register', (req, res) => {
    const { kullaniciAdi, sifre } = req.body;
    
    // Validasyon kontrolü
    if (!kullaniciAdi || !sifre || kullaniciAdi.trim() === '' || sifre.trim() === '') {
        return res.redirect('/register?error=empty');
    }
    
    // Kullanıcı adının zaten kullanılıp kullanılmadığını kontrol et
    const existingUser = users.find(user => user.kullaniciAdi === kullaniciAdi.trim());
    if (existingUser) {
        return res.redirect('/register?error=exists');
    }
    
    // Yeni kullanıcı objesi oluştur
    const newUser = {
        id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
        kullaniciAdi: kullaniciAdi.trim(),
        sifre: sifre.trim()
    };
    
    // Diziye ekle
    users.push(newUser);
    
    // Giriş sayfasına yönlendir
    res.redirect('/login?success=registered');
});

// Giriş sayfası (GET) - Hem giriş hem kayıt formu burada
app.get('/login', (req, res) => {
    console.log('✓ /login rotası çalıştı');
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
    
    // Validasyon kontrolü
    if (!kullaniciAdi || !sifre || kullaniciAdi.trim() === '' || sifre.trim() === '') {
        return res.redirect('/login?error=empty');
    }
    
    // Kullanıcıyı bul
    const user = users.find(u => 
        u.kullaniciAdi === kullaniciAdi.trim() && 
        u.sifre === sifre.trim()
    );
    
    // Kullanıcı bulunamadıysa veya şifre yanlışsa
    if (!user) {
        return res.redirect('/login?error=invalid');
    }
    
    // Başarılı giriş - session'a kullanıcı adını kaydet
    req.session.user = user.kullaniciAdi;
    
    // Ana sayfaya yönlendir
    res.redirect('/');
});

// Çıkış (Logout) rotası
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy hatası:', err);
        }
        res.redirect('/');
    });
});

// 404 middleware - Tüm route'lardan sonra çalışır
app.use((req, res, next) => {
    console.log('❌ 404 Hatası - Rota bulunamadı:', req.method, req.url);
    res.status(404).render('404', {
        currentPage: '',
        title: '404 - Sayfa Bulunamadı',
        user: res.locals.user
    });
});

// Port ayarı
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

module.exports = app;
