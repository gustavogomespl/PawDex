export const metadata = {
  title: "PawDex — Termos e Privacidade",
};

export default function TermsPage() {
  return (
    <main className="app-shell prose">
      <h1>Termos de Uso e Politica de Privacidade</h1>

      <h2>Uso responsavel</h2>
      <p>
        A PawDex registra animais avistados em lugares. Nao persiga, nao toque e
        nao alimente animais sem permissao, e nunca coloque um animal em risco.
      </p>

      <h2>Dados que tratamos (LGPD)</h2>
      <ul>
        <li>Conta: e-mail e nome usados para identificar voce no lugar.</li>
        <li>
          Conteudo: fotos, especie, apelidos e avistamentos que voce registra.
        </li>
        <li>
          Localizacao: usada apenas para verificar presenca no lugar; nao
          armazenamos coordenadas exatas.
        </li>
      </ul>

      <h2>Visibilidade</h2>
      <p>
        O conteudo de um lugar e visivel apenas para membros aprovados, exceto em
        lugares publicos. Lugares privados nao sao compartilhados externamente.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Voce pode acessar, corrigir e remover seu conteudo a qualquer momento em{" "}
        <a href="/account">Minha conta</a>. A remocao apaga definitivamente os
        animais e avistamentos que voce criou.
      </p>

      <p>
        <a href="/places">Voltar</a>
      </p>
    </main>
  );
}
