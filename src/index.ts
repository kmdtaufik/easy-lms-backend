import "dotenv/config";
import cors from "cors";
import express from "express";
import { auth } from "@/lib/auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import productRoutes from "./routers/productRoutes";
import { arcjetMiddleware } from "./middleware/arcjet.middleware";

const app = express();

// Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "",
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
// Apply middleware only for Better Auth routes
app.all("/api/auth/{*path}", arcjetMiddleware(), toNodeHandler(auth));
app.use(express.json());
app.use("/api/product", productRoutes);

// Example: get session
app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return res.json(session);
});

//product routes

// Example: basic route with Arcjet check
app.get("/", arcjetMiddleware(), (req, res) => {
  res.json({ message: "Hello World", arcjet: (req as any).arcjetDecision });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
