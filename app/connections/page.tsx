import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GOOGLE_SERVICES, type GoogleService } from "@/lib/google-services";
import { DisconnectButton } from "./disconnect-button";
import { signOutAction } from "../logout-action";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const connections = await prisma.googleConnection.findMany({
    where: { userId: session.user.id },
    orderBy: { connectedAt: "desc" },
    select: { googleAccountId: true, email: true, services: true, connectedAt: true }
  });

  return (
    <main className="shell">
      <header className="header page-header">
        <Link className="back-link" href="/">← Retour au chat</Link>
        <form action={signOutAction}><button className="secondary-button" type="submit">Déconnexion</button></form>
      </header>
      <section className="panel connections-panel">
        <h1>Connexions Google</h1>
        <p className="sub">Active uniquement les services dont Zodi AI a besoin. Chaque service demande son autorisation séparément.</p>
        <div className="service-list">
          {(Object.entries(GOOGLE_SERVICES) as [GoogleService, typeof GOOGLE_SERVICES[GoogleService]][]).map(([service, config]) => {
            const active = connections.filter((connection) => connection.services.includes(service));
            return (
              <article className="service-card" key={service}>
                <div>
                  <h2>{config.label}</h2>
                  <p>{config.description}</p>
                  {active.length > 0 ? active.map((connection) => (
                    <div className="connected-account" key={connection.googleAccountId}>
                      <span className="connected-dot" /> Connecté : {connection.email}
                      <DisconnectButton googleAccountId={connection.googleAccountId} service={service} />
                    </div>
                  )) : <span className="muted">Aucun compte connecté</span>}
                </div>
                <Link className="primary-link" href={"/api/google/connect?service=" + service}>Connecter</Link>
              </article>
            );
          })}
        </div>
        <p className="fine-print">Désactiver un service empêche Zodi AI de l’utiliser, mais ne révoque pas à lui seul l’autorisation accordée à Google. Pour révoquer complètement l’accès, utilise aussi la page Sécurité de ton compte Google.</p>
      </section>
    </main>
  );
}
