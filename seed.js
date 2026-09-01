// Örnek verilerle veritabanını doldurur. Kullanım: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

const kitaplar = [
    ['Suç ve Ceza', 'Fyodor Dostoyevski', 'Roman', 1866],
    ['Küçük Prens', 'Antoine de Saint-Exupéry', 'Çocuk Kitabı', 1943],
    ['Dune', 'Frank Herbert', 'Bilim Kurgu', 1965],
    ['Nutuk', 'Mustafa Kemal Atatürk', 'Tarih', 1927],
    ['Simyacı', 'Paulo Coelho', 'Roman', 1988],
    ['Yabancı', 'Albert Camus', 'Felsefe', 1942]
];

const mevcutKitap = db.prepare('SELECT COUNT(*) AS adet FROM books').get().adet;

if (mevcutKitap > 0) {
    console.log(`Veritabanında zaten ${mevcutKitap} kitap var. Örnek kitaplar eklenmedi.`);
} else {
    const ekle = db.prepare('INSERT INTO books (ad, yazar, tur, yayin_yili) VALUES (?, ?, ?, ?)');
    const islem = db.transaction(() => {
        kitaplar.forEach((k) => ekle.run(...k));
    });
    islem();
    console.log(`${kitaplar.length} örnek kitap eklendi.`);
}

const demoKullanici = db.prepare('SELECT id FROM users WHERE kullanici_adi = ?').get('demo');

if (!demoKullanici) {
    const sifreHash = bcrypt.hashSync('demo1234', 10);
    db.prepare('INSERT INTO users (kullanici_adi, sifre_hash) VALUES (?, ?)').run('demo', sifreHash);
    console.log('Demo kullanıcı eklendi → kullanıcı adı: demo / şifre: demo1234');
} else {
    console.log('Demo kullanıcı zaten mevcut.');
}

console.log('İşlem tamam.');
