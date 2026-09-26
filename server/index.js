import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { authenticate, clearSession, login, setSession, loadSession } from "./auth.js";
import iamRouter from "./routes/iam.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, module: "identity_access", db: "neon" });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    const result = await login(email, password);
    if (!result) return res.status(401).json({ error: "Invalid email or password" });
    if (result.disabled) return res.status(403).json({ error: "Account is not active" });
    setSession(res, result.id);
    res.json(await loadSession(result.id));
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/auth/session", authenticate, (req, res) => {
  res.json(req.user);
});

app.use("/api/iam", authenticate, iamRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SMS IAM API listening on ${PORT} (Neon)`);
});
