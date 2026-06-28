import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  isDevEmailAuthEnabled,
  normalizeDisplayName,
  normalizeEmail,
  syncUser,
} from "@/domain/auth/dev-auth";

const devEmailProvider = Credentials({
  id: "dev-email",
  name: "Dev (e-mail)",
  credentials: {
    name: { label: "Nome", type: "text" },
    email: { label: "E-mail", type: "email" },
  },
  async authorize(credentials) {
    const email = normalizeEmail(
      typeof credentials?.email === "string" ? credentials.email : null,
    );
    const name = normalizeDisplayName(
      typeof credentials?.name === "string" ? credentials.name : null,
    );

    if (!email) {
      return null;
    }

    const user = await syncUser(email, name);
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.email,
    };
  },
});

/**
 * Dev-first auth: JWT sessions (no database adapter) with a self-managed `users`
 * table owned by the ML API. The dev e-mail provider needs no external
 * credentials — entering an e-mail signs you in and upserts the user. Swap in
 * Google / a real e-mail magic-link provider later by adding providers + env.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  // Self-hosted behind the compose network / a reverse proxy (not Vercel).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: isDevEmailAuthEnabled() ? [devEmailProvider] : [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
