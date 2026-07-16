import "dotenv/config";
import express from "express";
import cors from "cors";
import sql from "./config/db.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/data", async (req,res) => {
    const response = await sql`SELECT * FROM users`
    res.status(200).send(response)
})


const PORT = process.env.PORT;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
