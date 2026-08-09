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

app.use("/api", router);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası" });
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
