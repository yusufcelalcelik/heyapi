# heyAPI

Kişisel bir sosyal medya uygulaması için geliştirilen backend API. Kullanıcı kaydı/girişi, oturum yönetimi ve ileride sosyal medya uygulamasının ihtiyaç duyacağı diğer servisleri (gönderi, takip, bildirim vb.) sağlamayı amaçlar.

## Tech Stack

- **Node.js / Express** — HTTP API katmanı
- **PostgreSQL** — kalıcı veri deposu
- **Redis** — refresh token / oturum yönetimi
- **JWT** (access + refresh token) — kimlik doğrulama
- **bcrypt** — şifre hash'leme
- **Docker Compose** — yerel geliştirme ortamında Postgres ve Redis

## Mimari Notlar

- Access token'lar stateless JWT olarak üretilir (HS256), her istekte veritabanına/Redis'e gidilmeden imza ve süre kontrolü ile doğrulanır.
- Refresh token'lar Redis'te tutulur ve cihaz/oturum bazında saklanır; bu sayede kullanıcı tek bir cihazdaki oturumunu diğerlerini etkilemeden sonlandırabilir, şifre değişikliğinde tüm oturumlar toplu olarak iptal edilebilir.

## Kurulum

1. Bağımlılıkları yükle:
   ```bash
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyala ve kendi değerlerinle doldur:
   ```bash
   cp .env.example .env
   ```
3. Postgres ve Redis'i ayağa kaldır:
   ```bash
   docker compose up -d
   ```
4. Uygulamayı başlat:
   ```bash
   npm start
   ```

## Lisans

Bu proje [MIT Lisansı](./LICENSE) ile lisanslanmıştır.
