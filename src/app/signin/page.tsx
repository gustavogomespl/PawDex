import { SignInForm } from "@/components/SignInForm";
import { Album, LockKeyhole, ShieldCheck } from "lucide-react";

export default function SignInPage() {
  return (
    <main className="signin-shell">
      <section className="signin-card" aria-labelledby="signin-title">
        <div className="signin-panel">
          <span className="section-eyebrow">
            <Album aria-hidden="true" size={16} />
            Albuns privados por lugar
          </span>
          <h1 id="signin-title">Entrar na PawDex</h1>
          <p>
            Crie sua conta ou entre com e-mail e senha. Os codigos dos lugares
            ficam dentro da area logada, separados do acesso da pessoa.
          </p>
          <SignInForm />
        </div>

        <aside className="signin-privacy" aria-label="Protecao dos dados">
          <div className="signin-privacy__stamp">
            <ShieldCheck aria-hidden="true" size={26} />
          </div>
          <h2>Dados protegidos por padrao</h2>
          <ul className="signin-privacy-list">
            <li>
              <LockKeyhole aria-hidden="true" size={16} />
              Albuns visiveis somente para membros do lugar.
            </li>
            <li>
              <ShieldCheck aria-hidden="true" size={16} />
              Fotos passam pelo backend antes de aparecer no album.
            </li>
            <li>
              <Album aria-hidden="true" size={16} />
              Cada lugar tem sua propria colecao, convite e permissao.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
