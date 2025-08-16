import "dotenv/config";
import cors from "cors";
import express from "express";
import { auth } from "./lib/auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type {
  BotOptions,
  EmailOptions,
  ProtectSignupOptions,
  SlidingWindowRateLimitOptions,
} from "@arcjet/node";
import { email, int } from "zod";
import ip from "@arcjet/ip";
import aj, { detectBot, protectSignup, slidingWindow } from "./lib/arcjet";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "",
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

//Arcjet middleware
const emailOptions = {
  mode: "LIVE",
  block: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"],
} satisfies EmailOptions;

const botOptions = {
  mode: "LIVE",
  allow: [],
} satisfies BotOptions;

const rateLimitOptions = {
  mode: "LIVE",
  interval: "2m",
  max: 5,
} satisfies SlidingWindowRateLimitOptions<[]>;

const signupOptions = {
  email: emailOptions,
  bots: botOptions,
  rateLimit: rateLimitOptions,
} satisfies ProtectSignupOptions<[]>;

async function protect(req: any) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  let userId: string;
  if (session?.user.id) userId = session.user.id;
  else userId = ip(req) || "127.0.0.1";

  if (req.path === "/api/auth/sign-up") {
    const body = await req.clone().json();

    if (typeof body.email === "string") {
      return aj
        .withRule(protectSignup(signupOptions))
        .protect(req, { email: body.email, fingerprint: userId });
    } else {
      return aj
        .withRule(detectBot(botOptions))
        .withRule(slidingWindow(rateLimitOptions))
        .protect(req, { fingerprint: userId });
    }
  } else {
    //for all other auth requests
    return aj
      .withRule(detectBot(botOptions))
      .protect(req, { fingerprint: userId });
  }
}

app.all("/api/auth/{*path}", toNodeHandler(auth));

app.get("/api/me", async (req, res) => {
  if (process.env.NODE_ENV !== "production")
    console.log("Received request for session:", req.headers);
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return res.json(session);
});

app.use(express.json());

// app.get("/", (_req, res) => {
//   res.status(200).send("OK");
// });

app.get("/", async (req, res) => {
  const decision = await protect(req); // Deduct 5 tokens from the bucket
  console.log("Arcjet decision", decision);

  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too Many Requests" }));
    } else if (decision.reason.isEmail()) {
      let message: string;
      if (decision.reason.emailTypes.includes("DISPOSABLE")) {
        message = "Disposable email addresses are not allowed.";
      } else if (decision.reason.emailTypes.includes("INVALID")) {
        message = "Invalid email address.";
      } else if (decision.reason.emailTypes.includes("NO_MX_RECORDS")) {
        message = "Email domain does not have valid MX records.";
      } else {
        message = "Invalid email address.";
      }
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    } else {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
    }
  } else if (decision.ip.isHosting()) {
    // Requests from hosting IPs are likely from bots, so they can usually be
    // blocked. However, consider your use case - if this is an API endpoint
    // then hosting IPs might be legitimate.
    // https://docs.arcjet.com/blueprints/vpn-proxy-detection
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
  } else if (decision.results.some(isSpoofedBot)) {
    // Paid Arcjet accounts include additional verification checks using IP data.
    // Verification isn't always possible, so we recommend checking the decision
    // separately.
    // https://docs.arcjet.com/bot-protection/reference#bot-verification
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Hello World" }));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
