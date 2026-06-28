import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  authorizePasswordCredentials,
  isDevEmailAuthEnabled,
} from "@/domain/auth/dev-auth";

const devEmailProvider = Credentials({
  id: "dev-email",
  name: "Dev (e-mail)",
  credentials: {
    mode: { label: "Modo", type: "text" },
    name: { label: "Nome", type: "text" },
    email: { label: "E-mail", type: "email" },
    password: { label: "Senha", type: "password" },
  },
  async authorize(credentials) {
    const user = await authorizePasswordCredentials(credentials);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.email,
    };
  },
});

/**
 * Dev-first auth: JWT sessions (no database adapter) with a self-managed `users`
 * table owned by the ML API. This private-demo credentials provider stores
 * password hashes in the ML API database. Swap in Google / a real e-mail
 * provider later by adding providers + env.
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
