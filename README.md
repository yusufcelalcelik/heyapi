# heyAPI

Kişisel bir sosyal medya uygulaması için geliştirilen backend API. Kullanıcı kaydı/girişi, oturum yönetimi, birebir mesajlaşma ve ileride sosyal medya uygulamasının ihtiyaç duyacağı diğer servisleri (gönderi, takip, bildirim vb.) sağlamayı amaçlar.

## Tech Stack

- **Node.js / Express** — HTTP API katmanı
- **PostgreSQL** — kalıcı veri deposu
- **Redis** — refresh token / oturum yönetimi
- **JWT** (access + refresh token) — kimlik doğrulama
- **bcrypt** — şifre hash'leme
- **multer / sharp** — profil fotoğrafı yükleme, işleme ve boyutlandırma
- **Docker Compose** — yerel geliştirme ortamında Postgres ve Redis

## Mimari Notlar

- Access token'lar stateless JWT olarak üretilir (HS256), her istekte veritabanına/Redis'e gidilmeden imza ve süre kontrolü ile doğrulanır.
- Refresh token'lar Redis'te tutulur ve cihaz/oturum bazında saklanır; bu sayede kullanıcı tek bir cihazdaki oturumunu diğerlerini etkilemeden sonlandırabilir, şifre değişikliğinde tüm oturumlar toplu olarak iptal edilebilir.
- Mesajlaşma `conversations` / `conversation_participants` / `messages` tabloları üzerine kurulu; bir sohbetin mesajlarına erişmeden önce her zaman `conversation_participants` üzerinden kullanıcının o sohbete katılımcı olduğu doğrulanır.
- Mesaj silme "soft delete" olarak yapılır (`deleted_at`); silinen mesajlar listeleme endpoint'inde hiç dönmez ama veritabanından kalıcı olarak silinmez.
- Profil fotoğrafları sunucunun kendi diskinde (`uploads/avatars/`) tutulur, `/uploads` altından statik olarak servis edilir. Yüklenen görsel formatı ne olursa olsun `sharp` ile jpg'e çevrilip 512×512 boyutlandırılır ve `<kullanıcı-uuid>.jpg` olarak sabit isimle kaydedilir — yeni yükleme eskisinin üzerine yazılır.

## API Endpoint'leri

Tüm endpoint'lerin başına `/api` prefix'i eklenir (örn. `POST /api/login`). 🔒 işaretli endpoint'ler `Authorization: Bearer <accessToken>` header'ı gerektirir.

### Kimlik Doğrulama

| Method | Path | Açıklama |
|---|---|---|
| `PUT` | `/otp` | E-postaya doğrulama kodu gönderir |
| `POST` | `/register` | Yeni kullanıcı kaydı oluşturur (OTP doğrulaması ile) |
| `POST` | `/login` | Kullanıcı adı/şifre ile giriş yapar, access + refresh token döner |
| `POST` | `/refresh` | Refresh token ile yeni bir access + refresh token çifti üretir (refresh token `Authorization` headerından okunur) |
| `POST` | `/logout` | Refresh tokenı Redis'ten siler, oturumu sonlandırır |
| 🔒 `GET` | `/me` | Giriş yapan kullanıcının profil bilgilerini döner |
| `GET` | `/check-user` | Bir kullanıcı adının kullanılıp kullanılmadığını kontrol eder |

### Profil

| Method | Path | Açıklama |
|---|---|---|
| 🔒 `POST` | `/me/avatar` | Profil fotoğrafı yükler (`multipart/form-data`, `avatar` alanı; jpg/png/webp, maks. 5MB) |

### Mesajlaşma

| Method | Path | Açıklama |
|---|---|---|
| 🔒 `GET` | `/conversations` | Giriş yapan kullanıcının dahil olduğu sohbetleri, karşı taraf bilgisi ve son mesajla birlikte listeler |
| 🔒 `GET` | `/conversations/:id/messages` | Bir sohbetteki (silinmemiş) mesajları kronolojik sırayla listeler |
| 🔒 `POST` | `/conversations/:id/messages` | Sohbete yeni mesaj gönderir |
| 🔒 `PATCH` | `/conversations/:id/messages/:messageId` | Kendi gönderdiğin bir mesajı düzenler |
| 🔒 `DELETE` | `/conversations/:id/messages/:messageId` | Kendi gönderdiğin bir mesajı siler (soft delete) |

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
