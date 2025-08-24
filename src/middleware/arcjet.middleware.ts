import type {
  BotOptions,
  EmailOptions,
  ProtectSignupOptions,
  SlidingWindowRateLimitOptions,
} from "@arcjet/node";
import ip from "@arcjet/ip";
import aj, { detectBot, protectSignup, slidingWindow } from "@/lib/arcjet";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
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

  if (req.path === "/api/auth/sign-up") {
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
  } else {
    return aj
      .withRule(detectBot(botOptions))
      .protect(req, { fingerprint: userId });
  }
}

// Arcjet middleware
export function arcjetMiddleware() {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const decision = await protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res.status(429).json({ error: "Too Many Requests" });
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
        return res.status(400).json({ error: message });
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Pass along decision if needed later
    (req as any).arcjetDecision = decision;
    if (process.env.NODE_ENV === "development")
      // console.log("Arcjet Decision:", decision);
      next();
  };
}
