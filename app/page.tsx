import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ChatClient email={session.user.email || "Compte Zodi"} />;
}
