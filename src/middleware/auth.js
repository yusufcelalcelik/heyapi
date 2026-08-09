import jwt from "jsonwebtoken";

export function authenticate(req, res, next) {
  // Geliştirme kolaylığı: SKIP_AUTH=true iken token zorunluluğu devre dışı kalır
  if (process.env.SKIP_AUTH === "true") {
    req.user = { uuid: process.env.DEV_USER_UUID || "dev-user" };
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid access token" });
    req.user = user;
    next();
  });
}