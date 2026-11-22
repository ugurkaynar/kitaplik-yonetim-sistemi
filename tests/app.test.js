const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const test = require('node:test');

const dbPath = path.join(os.tmpdir(), `kitaplik-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbPath;
process.env.SESSION_SECRET = 'test-oturum-anahtari';
process.env.PAGE_SIZE = '2';

const app = require('../app');
const db = require('../db');

function istek(base, method, urlPath, { form, cookie } = {}) {
    return new Promise((resolve, reject) => {
        const data = form ? new URLSearchParams(form).toString() : '';
        const u = new URL(urlPath, base);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: `${u.pathname}${u.search}`,
            method,
            headers: {
                ...(data ? {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(data)
                } : {}),
                ...(cookie ? { Cookie: cookie } : {})
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function cerezAl(res, onceki = '') {
    const tumu = res.headers['set-cookie'] || [];
    const sidler = tumu.filter((c) => c.startsWith('connect.sid='));
    if (sidler.length === 0) return onceki;
    return sidler[sidler.length - 1].split(';')[0];
}

function csrfAl(html) {
    const eslesme = html.match(/name="_csrf" value="([a-f0-9]+)"/);
    assert.ok(eslesme, 'CSRF token bulunamadı');
    return eslesme[1];
}

test('kitaplık akışı', { timeout: 30000 }, async () => {
    const server = await new Promise((resolve) => {
        const dinleyen = app.listen(0, '127.0.0.1', () => resolve(dinleyen));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const anaSayfa = await istek(base, 'GET', '/');
        assert.equal(anaSayfa.status, 200);
        assert.match(anaSayfa.body, />0<\/strong> kitap/);

        const giris = await istek(base, 'GET', '/login');
        assert.equal(giris.status, 200);
        assert.doesNotMatch(giris.body, /invalid-feedback d-block/);
        let cookie = cerezAl(giris);
        let token = csrfAl(giris.body);

        const kayit = await istek(base, 'POST', '/register', {
            cookie,
            form: {
                _csrf: token,
                kullaniciAdi: 'TestKullanici',
                sifre: 'gizli123',
                next: '/add-book'
            }
        });
        assert.equal(kayit.status, 302);
        assert.match(kayit.headers.location, /success=registered/);
        assert.match(kayit.headers.location, /next=%2Fadd-book/);

        const mukerrer = await istek(base, 'POST', '/register', {
            cookie,
            form: { _csrf: token, kullaniciAdi: 'testkullanici', sifre: 'gizli123' }
        });
        assert.equal(mukerrer.status, 302);
        assert.match(mukerrer.headers.location, /error=exists/);
        assert.match(mukerrer.headers.location, /form=register/);

        const yanlis = await istek(base, 'POST', '/login', {
            cookie,
            form: { _csrf: token, kullaniciAdi: 'TestKullanici', sifre: 'yanlis', next: '/add-book' }
        });
        assert.equal(yanlis.status, 302);
        assert.match(yanlis.headers.location, /error=invalid/);

        const misafir = await istek(base, 'POST', '/add-book', {
            form: { ad: 'Izinsiz', yazar: 'Yazar Ad', tur: 'Roman', yayinYili: '2000' }
        });
        assert.equal(misafir.status, 302);
        assert.match(misafir.headers.location, /\/login\?/);
        assert.match(misafir.headers.location, /error=auth/);

        const dogru = await istek(base, 'POST', '/login', {
            cookie,
            form: { _csrf: token, kullaniciAdi: 'TestKullanici', sifre: 'gizli123', next: '/add-book' }
        });
        assert.equal(dogru.status, 302);
        assert.equal(dogru.headers.location, '/add-book');
        cookie = cerezAl(dogru, cookie);

        const ekleSayfa = await istek(base, 'GET', '/add-book', { cookie });
        assert.equal(ekleSayfa.status, 200);
        token = csrfAl(ekleSayfa.body);

        const gecersiz = await istek(base, 'POST', '/add-book', {
            cookie,
            form: { _csrf: token, ad: 'A', yazar: 'Yazar Ad', tur: 'Roman', yayinYili: '2000' }
        });
        assert.equal(gecersiz.status, 400);
        assert.match(gecersiz.body, /geçerli bilgilerle/);

        const sahteToken = await istek(base, 'POST', '/add-book', {
            cookie,
            form: { _csrf: 'a'.repeat(64), ad: 'Geçerli Kitap', yazar: 'Yazar Ad', tur: 'Roman', yayinYili: '2001' }
        });
        assert.equal(sahteToken.status, 403);
        assert.match(sahteToken.body, /reddedildi/);

        const kitaplar = [
            ['Suç ve Ceza', 'Fyodor Dostoyevski', 'Roman', '1866'],
            ['Küçük Prens', 'Antoine de Saint-Exupéry', 'Çocuk Kitabı', '1943'],
            ['Nutuk', 'Mustafa Kemal Atatürk', 'Tarih', '1927']
        ];
        for (const [ad, yazar, tur, yayinYili] of kitaplar) {
            const sonuc = await istek(base, 'POST', '/add-book', {
                cookie,
                form: { _csrf: token, ad, yazar, tur, yayinYili }
            });
            assert.equal(sonuc.status, 302);
            assert.match(sonuc.headers.location, /success=added/);
        }

        const aramaSuc = await istek(base, 'GET', '/books?search=' + encodeURIComponent('SUÇ'));
        assert.equal(aramaSuc.status, 200);
        assert.match(aramaSuc.body, /Suç ve Ceza/);
        assert.doesNotMatch(aramaSuc.body, /Nutuk/);

        const aramaTur = await istek(base, 'GET', '/books?search=' + encodeURIComponent('çocuk'));
        assert.match(aramaTur.body, /Küçük Prens/);
        assert.doesNotMatch(aramaTur.body, /Nutuk/);

        const joker = await istek(base, 'GET', '/books?search=' + encodeURIComponent('_'));
        assert.match(joker.body, /uygun kitap bulunamadı/);

        const sayfa2 = await istek(base, 'GET', '/books?page=2');
        assert.equal(sayfa2.status, 200);
        assert.match(sayfa2.body, /Sayfa 2 \/ 2/);
        assert.match(sayfa2.body, /Nutuk/);
        assert.doesNotMatch(sayfa2.body, /Suç ve Ceza/);

        const id = db.prepare('SELECT id FROM books WHERE ad = ?').get('Nutuk').id;
        const duzenleSayfa = await istek(base, 'GET', `/edit/${id}`, { cookie });
        token = csrfAl(duzenleSayfa.body);
        const duzenle = await istek(base, 'POST', `/edit/${id}`, {
            cookie,
            form: {
                _csrf: token,
                ad: 'Nutuk (Güncel)',
                yazar: 'Mustafa Kemal Atatürk',
                tur: 'Tarih',
                yayinYili: '1927'
            }
        });
        assert.equal(duzenle.status, 302);
        assert.match(duzenle.headers.location, /success=updated/);

        const liste = await istek(base, 'GET', '/books?page=2', { cookie });
        token = csrfAl(liste.body);
        const sil = await istek(base, 'POST', `/delete/${id}`, {
            cookie,
            form: { _csrf: token, page: '2' }
        });
        assert.equal(sil.status, 302);
        assert.match(sil.headers.location, /success=deleted/);
        assert.equal(db.prepare('SELECT id FROM books WHERE id = ?').get(id), undefined);

        const iletisimSayfa = await istek(base, 'GET', '/contact');
        const iletisimCerez = cerezAl(iletisimSayfa);
        const iletisimToken = csrfAl(iletisimSayfa.body);
        const iletisim = await istek(base, 'POST', '/contact', {
            cookie: iletisimCerez,
            form: {
                _csrf: iletisimToken,
                ad: 'Ayşe',
                soyad: 'Yılmaz',
                mesaj: 'Kütüphane hakkında bir sorum var.'
            }
        });
        assert.equal(iletisim.status, 302);
        assert.match(iletisim.headers.location, /success=sent/);
        const kayitliMesaj = db.prepare('SELECT mesaj FROM messages WHERE ad = ?').get('Ayşe');
        assert.equal(kayitliMesaj.mesaj, 'Kütüphane hakkında bir sorum var.');

        const olmayan = await istek(base, 'GET', '/boyle-bir-sayfa-yok');
        assert.equal(olmayan.status, 404);
        assert.match(olmayan.body, />404</);
        assert.match(olmayan.body, /Aradığınız sayfa bulunamadı/);

        const ikon = await istek(base, 'GET', '/favicon.ico');
        assert.equal(ikon.status, 204);

        const cikis = await istek(base, 'POST', '/logout', {
            cookie,
            form: { _csrf: token }
        });
        assert.equal(cikis.status, 302);
        assert.equal(cikis.headers.location, '/');

        const korumali = await istek(base, 'GET', '/add-book', { cookie: cerezAl(cikis, cookie) });
        assert.equal(korumali.status, 302);
        assert.match(korumali.headers.location, /error=auth/);
    } finally {
        await new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(() => resolve());
        });
        db.close();
        for (const ek of ['', '-wal', '-shm']) {
            fs.rmSync(dbPath + ek, { force: true });
        }
    }
});
