import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import sql from "./config/db.js";
import redisClient from "./config/redis.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/data", async (req, res) => {
    const response = await sql`SELECT * FROM users`
    res.status(200).send(response)
})

app.put("/otp", async (req, res) => {
    const { email } = req.body;
    const otp = crypto.randomInt(100000, 1000000)
    await redisClient.set(`otp:${email}`, otp, { EX: 300 })
    res.status(200).json({ success: true })
})

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const [user] = await sql`SELECT password FROM users WHERE username = ${username}`
    if (!user) return res.status(401).json({ error: "Username or Password incorrect" });

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) return res.status(401).json({ error: "Username or Password incorrect" });

    const [response] = await sql`SELECT uuid,name FROM users WHERE username = ${username}`
    res.send(response)
})

app.post("/register", async (req, res) => {
    const { username, name, email, password } = req.body;

    // Kullanıcı adı ya da email zaten varsa kontrolü
    const [{ exists }] = await sql`SELECT EXISTS(SELECT 1 FROM users WHERE username = ${username} OR email = ${email}) AS exists`
    if (exists) return res.status(409).json({ error: "Bu kullanıcı adı veya email zaten kullanılıyor" })

    // Yoksa kayıt edelim
    const hash = await bcrypt.hash(password, 10)

    const [user] = await sql`
        INSERT INTO users (username, name, email, password)
        VALUES (${username}, ${name}, ${email}, ${hash})
        RETURNING uuid, username, name
    `
    
    res.status(201).json(user)
})

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
