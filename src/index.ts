import "dotenv/config";
import cors from "cors";
import express from "express";
import { auth } from "@/lib/auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import productRoutes from "./routers/productRoutes";
import { arcjetMiddleware } from "./middleware/arcjet.middleware";
import chapterRoutes from "./routers/chapter.route";
import lessonRoutes from "./routers/lesson.route";
import enrollmentRoutes from "./routers/enrollment.route";
import statsRoutes from "./routers/stats.route";
import lessonProgressRoutes from "./routers/lessonProgress.route";
import { authenticateToken } from "./middleware/auth.middleware";

const app = express();

// Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "",
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Apply middleware only for Better Auth routes
app.all("/api/auth/{*path}", arcjetMiddleware(), toNodeHandler(auth)); //Warn: do not change the {*path} -> *
app.use(express.json());

// Routes
app.use("/api/product", arcjetMiddleware(), productRoutes);
app.use("/api/chapter", arcjetMiddleware(), chapterRoutes);
// Lesson progress routes with authentication
app.use(
  "/api/lesson/progress",
  arcjetMiddleware(),
  authenticateToken,
  lessonProgressRoutes
);
app.use("/api/lesson", arcjetMiddleware(), lessonRoutes);
app.use("/api/enrollment", arcjetMiddleware(), enrollmentRoutes);
app.use("/api/stats", arcjetMiddleware(), statsRoutes);

// Example: get session
app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return res.json(session);
});

// Example: basic route with Arcjet check
app.get("/", arcjetMiddleware(), (req, res) => {
  res.json({ message: "Hello World", arcjet: (req as any).arcjetDecision });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
