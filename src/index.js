import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import sql from "./config/db.js";
import redisClient from "./config/redis.js";
import transporter from "./config/mailer.js";
import { generateAccessToken, generateRefreshToken } from "./utils/tokens.js";
import { authenticate } from "./middleware/auth.js";
const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

//Geçici olarak kullanıcıları listele
router.get("/data", async (req, res) => {
  //TEST için veri tabanına kolay erişim
  const response = await sql`SELECT * FROM users`;
  res.status(200).send(response);
});

//Yeni doğrulama kodu gönder
router.put("/otp", async (req, res) => {
  const { email } = req.body;

  //Doğrulama kodunu oluştur ve set et
  const otp = crypto.randomInt(100000, 1000000);
  await redisClient.set(`otp:${email}`, otp, { EX: 300 });
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Doğrulama Kodu",
    text: `Doğrulama kodunuz: ${otp}`,
  });
  //Yolla
  res.status(200).json({ success: true });
});
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(401).json({ error: "Refresh token required" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);

    //redisten kulanıcı için kayıtlıl refresh tokenı al
    const storedRefreshToken = await redisClient.get(
      `refreshToken:${payload.uuid}`,
    );
    // gelen refresh token ile redisten alınan refresh token eşleşiyor mu kontrol et
    if (storedRefreshToken !== refreshToken) {
      return res.status(403).json({ error: "Invalid refresh token" });
    }
    //Yeni access + refresh token oluştur
    const newAccessToken = generateAccessToken({ uuid: payload.uuid });
    const newRefreshToken = generateRefreshToken({ uuid: payload.uuid });
    await redisClient.set(`refreshToken:${payload.uuid}`, newRefreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(403).json({ error: "Invalid refresh token" });
  }
});
//Giriş Yap
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Kullanıcı bulunur
  const [user] =
    await sql`SELECT password FROM users WHERE username = ${username}`;
  if (!user)
    return res.status(401).json({ error: "Username or Password incorrect" });

  // Bcrypt ile password eşleşmesi kontrol edilir.
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid)
    return res.status(401).json({ error: "Username or Password incorrect" });

  //Bilgiler doğru ise kullanııcı bilgilerini çek ve yolla
  const [response] =
    await sql`SELECT uuid, name, username, post, follow, followers, bio FROM users WHERE username = ${username}`;

  // Access ve Refresh token oluştur
  const accessToken = generateAccessToken({ uuid: response.uuid });
  const refreshToken = generateRefreshToken({ uuid: response.uuid });

  // Refresh tokenı redis'e kaydet
  await redisClient.set(`refreshToken:${response.uuid}`, refreshToken, {
    EX: 7 * 24 * 60 * 60, // 7 gün
  });

  res.json({ ...response, accessToken, refreshToken });
});

router.post("/me", async (req, res) => {
  const { accessToken } = req.body;

  // Access token yoksa hata döndür
  if (!accessToken)
    return res.status(401).json({ error: "Access token required" });

  try {
    // Access tokenı doğrula ve kullanıcı bilgilerini çek
    const payload = jwt.verify(accessToken, process.env.JWT_SECRET);
    const [user] =
      await sql`SELECT uuid, name, username, post, follow, followers, bio FROM users WHERE uuid = ${payload.uuid}`;

    // Kullanıcı bulunamazsa hata döndür
    if (!user) return res.status(404).json({ error: "User not found" });

    // Kullanıcıyı döndür
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: "Invalid access token" });
  }
});

router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ error: "Refresh token required" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    // Refresh tokenı redis'ten sil
    await redisClient.del(`refreshToken:${payload.uuid}`);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: "Invalid refresh token" });
  }
});

//Kayıt ol
router.post("/register", async (req, res) => {
  const { username, name, email, password, otp } = req.body;

  // Kullanıcı adı ya da email zaten varsa kontrolü
  const [{ exists }] =
    await sql`SELECT EXISTS(SELECT 1 FROM users WHERE username = ${username} OR email = ${email}) AS exists`;
  if (exists)
    return res
      .status(409)
      .json({ error: "Bu kullanıcı adı veya email zaten kullanılıyor" });

  // OTP doğrulaması
  const storedOtp = await redisClient.get(`otp:${email}`);
  if (!storedOtp || parseInt(storedOtp) !== otp) {
    return res.status(400).json({ error: "Geçersiz veya süresi dolmuş OTP" });
  }
  // Eşleşme yoksa şifreyi hash leyio kaydedelim
  const hash = await bcrypt.hash(password, 10);
  const [user] = await sql`
        INSERT INTO users (username, name, email, password)
        VALUES (${username}, ${name}, ${email}, ${hash})
        RETURNING uuid, name, username, post, follow, followers, bio
    `;
  //Yolla
  res.status(201).json(user);
});
//Kullanıcı var mı kontrolü (username unique olduğu için sadece username üzerinden bakılır)
router.get("/check-user", async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username parametresi gerekli" });
  }

  const [{ exists }] =
    await sql`SELECT EXISTS(SELECT 1 FROM users WHERE username = ${username}) AS exists`;

  res.json({ exists });
});

// Konuşmaları listele (sadece giriş yapan kullanıcının katıldığı sohbetler)
router.get("/conversations", authenticate, async (req, res) => {
    const conversations = await sql`
      SELECT c.*
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_uuid = ${req.user.uuid}
      ORDER BY c.created_at DESC
    `;
    res.status(200).json(conversations);
});

// Bir sohbetteki mesajları listele (önce kullanıcının o sohbete katılımcı olduğu doğrulanır)
router.get("/conversations/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;

  const [participant] = await sql`
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = ${id} AND user_uuid = ${req.user.uuid}
  `;
  if (!participant)
    return res.status(403).json({ error: "Bu sohbete erişimin yok" });

  const messages = await sql`
    SELECT m.*
    FROM messages m
    WHERE m.conversation_id = ${id}
    ORDER BY m.created_at ASC
  `;
  res.status(200).json(messages);
});

// Mesaj gönder (önce kullanıcının o sohbete katılımcı olduğu doğrulanır)
router.post("/conversations/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) return res.status(400).json({ error: "content gerekli" });

  const [participant] = await sql`
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = ${id} AND user_uuid = ${req.user.uuid}
  `;
  if (!participant)
    return res.status(403).json({ error: "Bu sohbete erişimin yok" });

  // Mesajı ekle
  const [message] = await sql`
    INSERT INTO messages (conversation_id, sender_uuid, content)
    VALUES (${id}, ${req.user.uuid}, ${content})
    RETURNING *
  `;

  res.status(201).json(message);
});

app.use("/api", router);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası" });
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
