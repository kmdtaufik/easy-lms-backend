import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { client } from "../db";
import { emailOTP, admin } from "better-auth/plugins";
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: mongodbAdapter(client),
  telemetry: { enabled: false },
  trustedOrigins: [process.env.CORS_ORIGIN as string],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        const { data, error } = await resend.emails.send({
          from: "Easy LMS <onboarding@resend.dev>",
          to: [email],
          subject: "Easy LMS - Email Verification",
          html: `Your verification code is: <strong>${otp}</strong> <br>This code is valid for 3 minutes.`,
        });
      },
    }),
    admin(),
  ],
});
