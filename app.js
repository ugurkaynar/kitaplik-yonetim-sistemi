const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// View engine ayarı - EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static dosyalar için public klasörü
app.use(express.static(path.join(__dirname, 'public')));

// Kitapları saklamak için dizi (geçici olarak memory'de)
let books = [];

// Ana sayfa rotası
app.get('/', (req, res) => {
    res.render('index', { 
        books: books,
        currentPage: 'home',
        title: 'Ana Sayfa'
    });
});

// Yeni kitap ekleme sayfası (GET)
app.get('/add-book', (req, res) => {
    res.render('add-book', {
        currentPage: 'add',
        title: 'Kitap Ekle'
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
        title: 'Kitap Düzenle'
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
        title: 'Hakkımızda'
    });
});

// İletişim sayfası
app.get('/contact', (req, res) => {
    res.render('contact', {
        currentPage: 'contact',
        title: 'İletişim'
    });
});

// 404 middleware - Tüm route'lardan sonra çalışır
app.use((req, res, next) => {
    res.status(404).render('404', {
        currentPage: '',
        title: '404 - Sayfa Bulunamadı'
    });
});

// Port ayarı
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

module.exports = app;
