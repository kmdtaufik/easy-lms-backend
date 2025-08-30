import express from "express";
import { auth } from "@/lib/auth";
import { fromNodeHeaders } from "better-auth/node";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        name: string;
      };
    }
  }
}

export async function authenticateToken(
  req: any,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role || "user",
      name: session.user.name,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
}

export const isAdmin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};
