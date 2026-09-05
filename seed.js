// Örnek verilerle veritabanını doldurur (idempotent: mevcut veriyi asla bozmaz).
// - Doğrudan çalıştırma: npm run seed
// - app.js başlangıcında otomatik çağrılır (deploy platformları için)
const bcrypt = require('bcryptjs');
const db = require('./db');

const KITAPLAR = [
    ['Suç ve Ceza', 'Fyodor Dostoyevski', 'Roman', 1866],
    ['Küçük Prens', 'Antoine de Saint-Exupéry', 'Çocuk Kitabı', 1943],
    ['Dune', 'Frank Herbert', 'Bilim Kurgu', 1965],
    ['Nutuk', 'Mustafa Kemal Atatürk', 'Tarih', 1927],
    ['Simyacı', 'Paulo Coelho', 'Roman', 1988],
    ['Yabancı', 'Albert Camus', 'Felsefe', 1942]
];

function demoVerisiYukle() {
    const demoKullanici = db.prepare('SELECT id FROM users WHERE kullanici_adi = ?').get('demo');

    if (!demoKullanici) {
        const sifreHash = bcrypt.hashSync('demo1234', 10);
        db.prepare('INSERT INTO users (kullanici_adi, sifre_hash) VALUES (?, ?)').run('demo', sifreHash);
        console.log('Demo kullanıcı eklendi → kullanıcı adı: demo / şifre: demo1234');
    }

    const mevcutKitap = db.prepare('SELECT COUNT(*) AS adet FROM books').get().adet;

    if (mevcutKitap === 0) {
        const ekle = db.prepare('INSERT INTO books (ad, yazar, tur, yayin_yili) VALUES (?, ?, ?, ?)');
        const islem = db.transaction(() => {
            KITAPLAR.forEach((k) => ekle.run(...k));
        });
        islem();
        console.log(`${KITAPLAR.length} örnek kitap eklendi.`);
    }
}

if (require.main === module) {
    demoVerisiYukle();
    console.log('İşlem tamam.');
}

module.exports = demoVerisiYukle;
