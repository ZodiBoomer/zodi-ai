import RegisterForm from "./register-form";

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="logo">✦</div>
        <h1>Créer ton compte Zodi</h1>
        <p>Un compte personnel pour retrouver tes conversations et ta mémoire.</p>
        <RegisterForm />
      </section>
    </main>
  );
}
