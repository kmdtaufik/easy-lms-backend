import type {
  BotOptions,
  EmailOptions,
  ProtectSignupOptions,
  SlidingWindowRateLimitOptions,
} from "@arcjet/node";
import ip from "@arcjet/ip";
import aj, {
  detectBot,
  fixedWindow,
  protectSignup,
  slidingWindow,
} from "@/lib/arcjet";
import express from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";

// Arcjet Options
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

// Protection logic
async function protect(req: express.Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  const userId = session?.user.id || ip(req) || "127.0.0.1";

  try {
    // --- Signup Protection ---
    if (req.originalUrl === "/api/auth/sign-up") {
      const body = req.body;

      if (typeof body?.email === "string") {
        return aj
          .withRule(protectSignup(signupOptions))
          .protect(req, { email: body.email, fingerprint: userId });
      } else {
        return aj
          .withRule(detectBot(botOptions))
          .withRule(slidingWindow(rateLimitOptions))
          .protect(req, { fingerprint: userId });
      }
    }

    // --- Product Protection ---
    if (req.originalUrl.startsWith("/api/product")) {
      if (req.method === "GET") {
        return aj
          .withRule(detectBot(botOptions))
          .protect(req, { fingerprint: userId });
      }
      if (!session?.user?.id || session.user.role !== "admin") {
        // If no user && request is not get, deny explicitly
        return {
          isDenied: () => true,
          reason: { isCustom: () => true, message: "User not authorized." },
        } as any;
      }
      // Apply basic protections (bot + rate limit)
      return aj
        .withRule(detectBot(botOptions))
        .withRule(
          fixedWindow({
            mode: "LIVE",
            window: "1m",
            max: 10,
          })
        )
        .protect(req, { fingerprint: userId });
    }

    //--Enrollment protection---
    if (req.originalUrl.startsWith("/api/enrollment")) {
      if (!session) {
        return {
          isDenied: () => true,
          reason: { isCustom: () => true, message: "User not authenticated." },
        } as any;
      }
      return aj
        .withRule(detectBot(botOptions))
        .protect(req, { fingerprint: userId });
    }

    if (req.originalUrl.startsWith("/api/stats")) {
      if (!session?.user?.id || session.user.role !== "admin") {
        return {
          isDenied: () => true,
          reason: { isCustom: () => true, message: "User not authorized." },
        } as any;
      }
      return aj
        .withRule(detectBot(botOptions))
        .protect(req, { fingerprint: userId });
    }
    // --- Default Protection (all other routes) ---
    return aj
      .withRule(detectBot(botOptions))
      .protect(req, { fingerprint: userId });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.log("Arcjet error:", e);
    return {
      isDenied: () => false,
      reason: { isError: () => true, message: "Arcjet error" },
    } as any;
  }
}

// Arcjet middleware
export function arcjetMiddleware() {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const decision = await protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit?.()) {
        return res.status(429).json({ error: "Too Many Requests" });
      } else if (decision.reason.isEmail?.()) {
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
        return res.status(400).json({ error: message });
      } else if ((decision.reason as any).isCustom?.()) {
        return res.status(401).json({ error: "User not authenticated" });
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Pass along decision if needed later
    (req as any).arcjetDecision = decision;
    if (process.env.NODE_ENV === "development") {
      // console.log("Arcjet Decision:", decision);
    }
    next();
  };
}
