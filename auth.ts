import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile"
        }
      }
    })
  ],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    }
  },
  events: {
    async signIn({ account }) {
      if (account?.provider === "google") {
        await prisma.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data: { access_token: null, refresh_token: null, id_token: null }
        });
      }
    }
  }
});
