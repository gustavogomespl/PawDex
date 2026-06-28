# PawDex — Revisão da Implementação + Roadmap de Evolução (Web)

> Data: 2026-06-27 · Branch revisada: `pawdex-web-mvp` · Método: revisão multi-agente (37 agentes) com verificação adversarial de cada achado.

## Contexto

Esta revisão avalia o que **já foi implementado** contra (a) a corretude do código, (b) a solidez do pipeline de ML/banco e (c) a **visão completa de produto** (a "Pokédex social de pets por lugar"). Decisão confirmada com o produto: **é um web app mesmo** (Next.js + FastAPI + Postgres/pgvector) — não há nem haverá Flutter. A evolução continua nesta branch.

Descoberta estrutural importante: o app **não está no `main`** (que só tem docs). Ele vive nesta worktree/branch `pawdex-web-mvp`. Antes de produção, recomenda-se mesclar ao `main` para o repositório refletir o estado real.

## Veredito geral

O que existe é uma **fatia vertical bem arquitetada de UMA feature** da visão: *"ver o álbum de figurinhas de um lugar → registrar um avistamento com foto → a IA sugere um match dentro daquele lugar → o humano confirma (existente/novo) → o embedding é guardado para melhorar buscas futuras"*. O pipeline de ML está completo de ponta a ponta (YOLO11n detecta → recorta → MobileNetV3-Small gera vetor 576-d → pgvector busca por cosseno escopada a lugar+espécie → top-3 → confirmação humana), com transações atômicas e bons testes unitários.

Porém o app é **monousuário e de um único lugar por construção**, sem autenticação, sem privacidade real, e ainda não publicável em produção. A maioria da visão social (auth, múltiplos lugares, membros, check-in, feed, moderação, gamificação, LGPD) **ainda não existe** — em vários casos o schema já tem o campo, mas nenhum código o usa.

## O que está bom (pontos fortes a preservar)

- **Arquitetura limpa:** lógica de domínio pura e tipada (`album.ts`, `actions.ts`, `storage.ts`) separada do React; componentes pequenos e apresentacionais; injeção por Protocols no ml-api (`Detector`/`ImageEmbedder`/`PawDexRepository`) — testável sem modelos nem DB.
- **pgvector correto:** operador `<=>` com `ORDER BY distance ASC` e `MIN(...)` por animal; escopo por `place_id` **e** `species` (`repository.py:167-188`).
- **Sem SQL injection:** tudo parametrizado com `%s` + tupla.
- **Confirmação atômica e concorrência-segura:** `SELECT ... FOR UPDATE` na pending analysis + inserts/updates numa única transação → confirmações idempotentes (`repository.py:246-283, 357-374`).
- **Embeddings corretos:** L2-normalizados, imutáveis, com validação de shape (576,), `model_version` e finitude (`embedding.py`).
- **Decodificação de imagem robusta:** `Image.open + load() + convert('RGB')` mapeia falha → HTTP 400 (`detection.py:67-73`).
- **Tratamento de async fora de ordem no front:** `analysisRequestIdRef` descarta respostas obsoletas de detecção (`SightingComposer.tsx`).
- **Boa base de testes unitários/contrato:** ~54 casos Vitest + ~62 pytest; as 4 rotas-proxy cobrem happy/400/502.
- **Stack 3 serviços dockerizada** (web, ml-api, db=pgvector pg18) com healthchecks em db e ml-api e proxy server-side (browser nunca fala direto com o ml-api).

## Bugs/defeitos confirmados (26)

Severidade ajustada após verificação adversarial. Caminhos relativos a `.worktrees/pawdex-web-mvp/`.

### 🔴 Alta
| # | Achado | Arquivo |
|---|--------|---------|
| 1 | **Webcam nunca é desligada** no unmount/cancel/upload (luz da câmera fica ligada; vazamento de privacidade e recurso). `stopCamera()` só é chamado em `captureFromCamera`; não há `useEffect` de cleanup. | `src/components/SightingComposer.tsx:81-124` |
| 2 | **Inferência ML e DB síncronos rodam no event loop:** todos os handlers são `async def` mas chamam YOLO/torch/psycopg bloqueantes sem offload → uma análise serializa o serviço inteiro (inclusive `/health`); throughput efetivo = 1. | `ml-api/app/main.py:125-163` |

### 🟠 Média
| # | Achado | Arquivo |
|---|--------|---------|
| 3 | Fotos como **data URL base64** são regravadas no localStorage a cada mudança de estado; captura PNG estoura a cota ~5MB → persistência quebra silenciosamente. | `src/hooks/usePawDexStore.ts:90-100` |
| 4 | **Pesos do YOLO não são embutidos na imagem Docker** — baixados da internet no 1º request (cold-start/dependência de CDN em prod). | `ml-api/Dockerfile:11-16` |
| 5 | Upload **sem limite de tamanho**; *decompression bomb* retorna 500 em vez de 400 (risco de DoS por memória). | `ml-api/app/main.py:132-163` |
| 6 | **Sem modelo de usuários/membros/auth:** `places.privacy_level` é decorativo (não é aplicado em lugar nenhum). | `db/init/001_schema.sql:8` |
| 7 | **Foto completa (data URL) é guardada no Postgres** e devolvida por endpoint **sem autenticação**. | `ml-api/app/repository.py:129-158` |
| 8 | `pending_sighting_analyses` **acumulam sem TTL/limpeza** se o usuário não confirma. | `ml-api/app/repository.py:201-235` |

### 🟡 Baixa (18) — resumo
- **9.** Caminho offline (`actions.ts`) é **código morto**; com backend fora do ar o app mostra o seed (Mingau/Caramelo) como se fosse real e as escritas falham em silêncio. `src/domain/pawdex/actions.ts`
- **10.** Botões de confirmação podem **double-submit** (sem guard de in-flight). `SightingComposer.tsx:300-334`
- **11.** **Constantes hardcoded** (place id, zone label, timezone, animal default) bloqueiam multi-lugar/zona/usuário. `usePawDexStore.ts:15`
- **12.** Rotas `analyze-sighting`/`detect` não protegem o parse do body (500 em vez de 400). `src/app/api/analyze-sighting/route.ts:18`
- **13.** Validação rasa e *casts* inseguros em respostas proxied. `src/app/api/confirm-sighting/route.ts:23-33`
- **14.** `warning`/`notice`/loading **não anunciados** para leitores de tela; enum cru exibido. `PawDexApp.tsx:42-45`
- **15.** Caminho `detectPetImage` + `/api/detect` **não usado** (código morto). `src/domain/detection/client.ts`
- **16.** Nits de corretude: coordenada da bounding-box, reset do input de arquivo, filtro redundante. `SightingComposer.tsx:392-405`
- **17/25.** `find_matches` **não filtra por `model_version`** → compara embeddings de modelos diferentes na 1ª troca de modelo. `repository.py:167-188`
- **18.** Pending analyses nunca são *garbage-collected*. `matching.py:80-88`
- **19.** `/health` reporta `model: "configured"` **sem verificar** se o modelo carrega. `main.py:125-130`
- **20.** **Sem índice ANN** nos embeddings e a query (`MIN()...GROUP BY`) não usaria um mesmo que existisse. `001_schema.sql:86-88`
- **21.** Migrations só rodam na 1ª init do volume; **sem ferramenta de migração**. `compose.yaml:9-11`
- **22.** Tabela `match_suggestions` **definida mas nunca lida/escrita**. `001_schema.sql:73-84`
- **23.** Faltam índices nas colunas de FK usadas por `ON DELETE CASCADE`. `001_schema.sql:45`
- **24.** **Seed embeddings são vetores one-hot ortogonais** → matching nunca dispara contra os animais semeados (não dá nem para demonstrar o "possible_existing"). `002_seed.sql:242-268`
- **26.** Credenciais de DB hardcoded e `DATABASE_URL` em texto puro no compose. `compose.yaml:5-7`

## Gaps vs a visão completa (produto)

A maioria da visão social ainda não existe. Itens **must-have** para uma evolução crível:
- **Auth + contas/perfil** (Google/e-mail magic link via Auth.js v5). Hoje: zero auth.
- **Multi-lugar** (remover `ACTIVE_PLACE_ID`; lista `/places` + rota `/places/[placeId]`). O schema já é multi-lugar; o bloqueio é só client-side.
- **Criação/gestão de lugar** (nome, foto, tipo, geofence, privacidade) + **membros/papéis** e fluxos de entrada (convite, QR, aprovação admin, proximidade GPS via Geolocation API do browser).
- **Autorização real** (members-only por padrão; privados nunca públicos; aplicar `privacy_level`).
- **Object storage** + **guardar só o recorte** (não a foto inteira) — pré-requisito de LGPD.

**Should-have:** check-in "estou no local" (GPS/QR), **score combinado** (70% visual + cor/porte + recorrência + qualidade + comunidade — hoje é só cosseno puro), ficha rica do animal (várias fotos, marcas, porte, edição), seleção de zona + mapa, feed do lugar, moderação/reports (o enum `needs-review` já existe), votação anti-duplicata + captura de feedback (a tabela `match_suggestions` já existe), lost & found / modo cuidado (status `lost`/`needs-help` já existem), blur de rostos/placas, "remover meu conteúdo"/export/admin (LGPD).

**Nice-to-have:** gamificação ampla (raridade calculada por recorrência, badges, missões, cards compartilháveis, votação de nomes), overlay de detecção em vídeo ao vivo.

## Roadmap priorizado (web-first)

Princípio de ordenação: **primeiro corrigir o que está quebrado** (barato, sem infra nova) → **infra que tudo depende** (object storage + migrations + build de produção) → **fundação multiusuário/multilocal** → **privacidade/LGPD** → **camada social** → **score/ficha** → **presença/cuidado/admin** → **gamificação**.

> Nota sobre suas prioridades: você marcou as 4 frentes. A **camada social/gamificação depende da fundação multiusuário/multilocal** (precisa de usuários e membros). Por isso a fundação (Fase C) vem antes do grosso do social (Fase E+), mas dá para entregar quick wins de gamificação cedo (raridade por recorrência, cards) depois que o núcleo social existir.

### Fase A — Estabilizar o código atual (sem infra nova)
> ✅ **Implementada e verificada em 2026-06-27** (TDD; pytest 68 passed, Vitest 65 passed em 3 execuções, `tsc --noEmit` limpo). Itens 1–8 abaixo concluídos, exceto a remoção de código morto (adiada de propósito — ver follow-up no fim).

Corrigir os defeitos confirmados de maior raio de impacto:
1. **Cleanup da webcam** (`SightingComposer.tsx`): `streamRef` + `useEffect(() => () => stop tracks, [])`; chamar `stopCamera()` em `handleFileChange` e após confirmar; limpar `videoRef.srcObject`.
2. **Desbloquear o event loop** (`main.py`): trocar os 5 handlers de `async def` → `def` (ou `anyio.to_thread.run_sync`). Throughput 1 → N.
3. **Capturar JPEG comprimido + downscale** (`SightingComposer.tsx:113`) — mata o estouro de cota e o payload gigante.
4. **Guard de double-submit** (flag `isSubmitting`).
5. **Hardening de upload** (cap de bytes → 413; `Image.DecompressionBombError` → 400; try/catch no `formData()`).
6. **Filtro `model_version`** no `find_matches` (um `AND`).
7. **Reconciliar Postgres × localStorage** (`usePawDexStore.ts:90-100`): Postgres autoritativo; localStorage só como cache de leitura, **keyed por place+user** antes do multi-lugar.
8. **a11y/pt-BR** (`role="alert"`/`aria-live`; rótulos de status em pt-BR) e **remover código morto** (ou ligar o offline de verdade).

### Fase B — Fundação de produção e migração (pré-requisito do resto)
> 🟡 **Quase completa — 2026-06-27.** ✅ Concluído e verificado: build de produção do web (Docker standalone multi-stage, non-root, headers de segurança — **imagem buildada, `node server.js` servindo HTTP 200**); `.env`/secrets + rede fechada (db/ml-api só `expose` internos, só web publica `:3000` — `docker compose config` válido); `restart` + limites de memória + healthcheck do web; pré-embute `yolo11n.pt` + `requirements-dev.txt` + `ml-api/.dockerignore`; CORS via env (pytest); auto-limpeza TTL de `pending_sighting_analyses` + índices FK-cascade/`created_at` (validados em pgvector real); CI GitHub Actions; **Alembic (migração)** — baseline espelhando o schema, `env.py` lê `DATABASE_URL`, entrypoint do ml-api roda `alembic upgrade head`, teste anti-drift (**validado em pgvector real: upgrade/downgrade/idempotência + coexistência com `db/init`**). ⏳ **Resta só: object storage (MinIO)** — o maior; será feito junto com o crop-only da Fase D.

- ✅ **Ferramenta de migração (Alembic)** — feita. Baseline = `ml-api/migrations/versions/0001_baseline.py` (espelha `db/init/001_schema.sql`; teste anti-drift `ml-api/tests/test_migrations.py`). `db/init` continua como bootstrap rápido do volume Docker; **schema novo daqui pra frente = nova migração Alembic** (nunca editar o baseline/001). Entrypoint `ml-api/entrypoint.sh` aplica migrações antes do uvicorn.
- **Object storage** (MinIO como 4º serviço, ou S3/R2): guardar URL/chave em vez de base64.
- **Build de produção do web** (`output: "standalone"` + multi-stage `next build` + `node server.js`, `NODE_ENV=production`) — bloqueador único de deploy, baixo esforço.
- **Secrets + rede:** tirar `pawdex:pawdex` para `.env`/secrets; **parar de publicar** `db:5432` e `ml-api:8000` no host (só rede interna; expor só `web`).
- **Pré-embutir `yolo11n.pt`** na imagem; split de deps de teste.
- **TTL** das pending analyses + índices de FK-cascade.
- **CI** (vitest, pytest, `next build`, `tsc --noEmit`, build das imagens) + **1 teste de integração contra pgvector real** (testcontainers).
- **Ops:** `restart: unless-stopped`, limites de memória no ml-api, logging estruturado + Sentry, CORS via env.

### Fase C — Fundação multiusuário/multilocal — ✅ **COMPLETA (2026-06-27)**
> ✅ **C1 (modelo de dados)**, ✅ **C2 (auth dev-first)**, ✅ **C3 (multilocal)**, ✅ **C4 (autorização/enforcement)** e ✅ **C5 (fluxos de entrada)** — todos feitos e verificados (pytest 103, vitest 69, tsc, next build, e fluxos em pgvector real). Estratégia: Auth.js v5 + sessão **JWT** + tabela `users` própria; login dev por e-mail; Google/SMTP via env depois.
>
> **C5** — migração `0004` (`invite_code` por lugar, default aleatório); `repository`: `get_place_by_invite_code`, `join_place` (upsert com regra de status), `list_members`, `set_member_status`, `get_place_geofence`; helper puro `haversine_meters`/`is_within_geofence`; endpoints `GET /invites/{code}`, `POST /places/{id}/join` (invite→approved / gps-no-raio→approved / request→pending), `GET /places/{id}/members` + `POST /places/{id}/members/{uid}` (admin); frontend: `/join/[code]` (botões convite/GPS/solicitar), `/places/[placeId]/admin` (link+QR de convite via `qrcode.react` + aprovar/rejeitar membros), rotas proxy. Verificado em pg real (invite resolve, join aprovado, pending→approve).
>
> **Pendências de verificação (toda a Fase C):** o login real no browser ponta a ponta e os fluxos de UI dependem da stack completa rodando (`docker compose up --build`); o backend, os contratos e o build foram verificados. A imagem do **ml-api** não foi buildada aqui (torch pesado).
>
> **C4** — enforcement: `repository.get_place_privacy` + `get_membership`; helper puro `is_place_access_allowed` (leitura: público OU membro aprovado; escrita: membro aprovado); endpoints por lugar (`/places/{id}/state`, `/analyze-sighting`, `/confirm-sighting`) exigem `user_id` e autorizam; **token interno** `X-Internal-Token` (opcional, ativo só com `PAWDEX_INTERNAL_TOKEN` setado) em todos os endpoints web-facing; rotas Next passam a sessão (`auth()`) → `userId`+token (401 sem sessão nas escritas); `src/middleware.ts` protege `/places/*`; atribuição `created_by` em animals/sightings. Verificado: pytest 91, vitest 69, tsc, next build (middleware no edge), e **pg real** (membro escreve/lê; não-membro 403 em ambos). *Obs.: o lugar-demo semeado é invite-only sem membros — pós-C4, usuários criam o próprio lugar (ou semear um membership é um follow-up de demo).*
>
> **C3** — migração `0003_place_profile.py` (photo_url + geofence em places); `repository.create_place` (criador vira admin/approved) + `list_places_for_user` (membros aprovados); endpoints `POST /places` e `GET /users/{id}/places`; `usePawDexStore(placeId)` e `PawDexApp({placeId})` (sem `ACTIVE_PLACE_ID` fixo); rotas `/places` (meus lugares), `/places/[placeId]`, `/places/new` + `CreatePlaceForm`; proxy `/api/places` (sessão); `/` → redireciona pra `/places`. Verificado: pytest 86, vitest 69, tsc, next build, e **pg real** (create→list com isolamento por membership: outro usuário vê 0 lugares).
>
> **C1** — migração `0002_users_membership.py`: `users`, `place_members` (role/status), `created_by` em animals/sightings/pending. Verificado em pgvector real (upgrade/downgrade/idempotência).
> **C2** — `next-auth@5.0.0-beta.31` (peer deps confirmam Next 16/React 19): `src/auth.ts` (Credentials dev provider, `trustHost`, callbacks jwt/session), `src/app/api/auth/[...nextauth]/route.ts`, `src/app/signin` + `SignInForm`, augment de tipos; ml-api `POST /users/sync` + `repository.upsert_user` (ON CONFLICT). Verificado: dev-auth (vitest), upsert (pytest + pg real idempotente), `tsc`, `next build`, vitest 69. **Pendente de verificação:** o clique de login no browser ponta a ponta (precisa da stack completa rodando). **Gating de rotas ainda NÃO ativado** (fica na C4) para não quebrar os testes/fluxos atuais.

- **Auth.js (NextAuth v5)** — ✅ dev-first feito (Google + e-mail magic link reais entram depois via env). Gate em `src/middleware.ts` → **C4**.
- **Membros + ownership:** ✅ `place_members(place_id,user_id,role,status)`; FK `created_by` em `animals`/`sightings`/`pending_sighting_analyses` (migração `0002`).
- **Aplicar privacidade:** passar `user_id` em `get_place_state`/`/places/{id}/state`/analyze/confirm; checar membership contra `privacy_level`; token interno compartilhado web↔ml-api.
- **Remover constantes hardcoded** (`usePawDexStore.ts:15,37`); mover para `/places/[placeId]`; timezone derivada do Place.
- **Ciclo de vida do lugar:** `/places` ("meus lugares"), form de criar lugar (`POST /places`, adicionar `photo_url`, geofence lat/lng/radius).
- **Fluxos de entrada:** convite (token assinado), QR (lib qrcode → página de join), aprovação admin, proximidade GPS (Geolocation API).

### Fase D — Privacidade-by-design & direitos LGPD — 🟡 **EM ANDAMENTO**
> ✅ **D-onda-1 (direitos do titular) — 2026-06-27.** Migração `0005` (`audit_log` append-only); `repository.delete_content_by_user` (apaga animais+avistamentos do usuário via `created_by`; cascata leva embeddings/sightings) + `record_audit`; endpoint `DELETE /users/{id}/content` (registra auditoria); rota `DELETE /api/account/content` (sessão); página `/account` ("Remover meu conteúdo" com confirmação) + `/terms` (Política/Termos LGPD); `/account` protegido no middleware. Verificado: pytest 105, vitest 69, tsc, next build, **pg real** (erasure zera o conteúdo do usuário + grava no audit_log). *Como as fotos ainda são base64 na linha, apagar a linha já remove a foto — o purge no object storage entra na D-onda-2.*

> ✅ **D-onda-2 (object storage + crop-only) — 2026-06-27.** Abstração `app/storage.py` (`ObjectStorage` Protocol + `InMemoryObjectStorage` p/ testes + `MinioObjectStorage` S3-compatível); MinIO como 4º serviço no compose + envs `PAWDEX_S3_*`; migração `0006` (`pending_sighting_analyses.crop_key`); no analyze, o **recorte** (`crop_to_box`) é re-encodado em JPEG (**descarta EXIF**) e enviado ao storage, gravando `crop_key` no pending; no confirm, o repositório persiste o **crop_key** como `photo_url`/`primary_photo_url` (fallback p/ a foto antiga) — **nunca mais a foto inteira em base64**; serving por rota autorizada `GET /media/{key}` (ml-api) + proxy `/api/media/[...key]` (sessão) + helper `mediaSrc` nos `<img>`. Verificado: pytest 112, vitest 71, tsc, next build, **MinIO real** (put/get + 404), e crop_key→photo no repositório. *(Bug pego na verificação e corrigido: `S3Error`→`KeyError` para 404.)*

> ✅ **D-onda-3 (blur + purge) — 2026-06-27.** `app/privacy.py`: `blur_regions` (PIL puro, testável) + `detect_sensitive_regions` (OpenCV Haar p/ rostos e placas, defensivo) + `blur_sensitive_regions`; no analyze o crop armazenado é **borrado** (rostos/placas) — embedding continua no crop original; `ObjectStorage.delete` + `is_storage_key`; o "remover meu conteúdo" agora **faz purge dos crops** no object storage (coleta as chaves antes de apagar as linhas). Verificado: pytest 118, vitest 71, tsc; OpenCV 4.11 + cascades carregam (blur funcional, não no-op).

> ✅ **D-onda-4 (admin/abuso) — 2026-06-27.** **Rate limiting** in-memory (`app/ratelimit.py`, sliding-window por usuário) na inferência (`/analyze-sighting` → 429), configurável via `PAWDEX_RATE_LIMIT_PER_MIN`; **export do lugar** (admin) `GET /places/{id}/export` + rota `/api/places/[id]/export` (download JSON) + link na página admin; **delete por admin** `repository.delete_animal` (cascata + coleta crop keys) + `DELETE /places/{id}/animals/{animalId}` (admin, purge no storage, audit) + rota Next + `AnimalAdminList` na página admin. Verificado: pytest 126, vitest 71, tsc, next build.

Itens restantes da Fase D (os 2 menores, adiados):
- **Captura de consentimento + base legal** (tabela + registro no signin) — acoplado ao auth; baixo valor relativo. *(Termos/Privacidade já existem.)*
- **CSP** (img-src) — adiado: Next + Turbopack precisam de nonce p/ scripts inline; um CSP fraco com `unsafe-inline` não compensa o risco de quebra sem teste runtime. *(non-root e demais headers de segurança já presentes desde a Fase B.)*

### Fase E — Fechar o loop social — 🟡 **EM ANDAMENTO**
> ✅ **Redesign visual "álbum da Copa" + feed — 2026-06-27.** Identidade Panini/Copa: binder verde-gramado + papel-figurinha creme + ouro de troféu; tipografia **Anton** (display/numeração) + **Hanken Grotesk** (corpo) via `next/font`; `globals.css` refeito. `AnimalStickerCard` virou **card de jogador** (camisa nº = slot, **OVR**, "posição" pela espécie, chip de raridade). **Raridade por recorrência** (`domain/pawdex/rarity.ts`): pouco visto = Comum, frequente = **Raro** (borda dourada), estrelas = **Lenda** (**cromado holográfico** + varredura de brilho, respeitando reduce-motion). `PlaceHeader` = banner de time + medidor; `AnimalTimeline` = card de detalhe; slots vazios = "por colar". **Feed "Últimos lances"** (`PlaceFeed`) no `PawDexApp`. Verificado: tsc, vitest 75, next build, e **revisão visual por screenshot (Chrome headless) de uma showcase temporária (removida)**.
>
> ⏳ Restante da E (social backend):
- **Persistir sugestões + decisões** em `match_suggestions` (hoje morta) e usar `review_status='needs-review'`; adicionar opção **"não sei"** (hoje só existente/novo).
- **Feed do lugar** (sightings já ordenadas por `taken_at DESC`).
- **Fila de revisão anti-duplicata** + votação + "mesclar duplicatas" (admin).
- **Reports/moderação** ligados ao `review_status`.
- **Seleção de zona** (quick win — backend já suporta `zone_label`, o front fixa "Area comum").

### Fase F — Aprofundar ficha e score
- **Ficha rica:** várias fotos + `size` + `marks` + página de edição.
- **Score combinado (70/10/10/5/5)** com breakdown explicável (hoje é `1 - cosseno`); usar recorrência da tabela `sightings`, qualidade (já calculada) e histórico da comunidade (Fase E).
- **Índice HNSW** + reescrever `find_matches` para `ORDER BY embedding <=> q LIMIT N` em subquery (index-elegível) antes de agregar por animal.
- **Corrigir seed embeddings** (vetores densos do modelo real, não one-hot).
- *Futuro:* re-ID fine-tuned (triplet/ArcFace/Siamese) quando houver dados reais.

### Fase G — Presença, cuidado e admin
- **Check-in** (`check_ins(user,place,method,expires_at)`) exigido para analyze/confirm; sinais web: Geolocation vs geofence + QR (WiFi/BLE → opcional/manual). Nunca persistir lat/long cru.
- **Lost & found / "precisa de cuidado"** (status já existem) + webhook opcional Slack/Teams por lugar.
- **Dashboard admin** (criar lugar, aprovar membros, mesclar duplicatas, remover/exportar conteúdo).

### Fase H — Gamificação (depois do núcleo sólido)
- **Raridade calculada por recorrência** (não texto livre).
- Badges + missões + votação de nomes + **cards compartilháveis** (`/og`, **desabilitado para lugares privados**).
- Overlay de detecção em vídeo ao vivo (throttled `/api/detect` ou tfjs/onnxruntime-web).

## Top quick wins (alto valor, baixo esforço — fazer já)
1. Cleanup da webcam (`SightingComposer.tsx`).
2. `async def` → `def` nos 5 handlers (`main.py`) — 1 palavra cada, throughput 1 → N.
3. Captura JPEG + downscale (`SightingComposer.tsx:113`).
4. Build de produção do Next (`output: "standalone"` + CMD não-dev).
5. Parar de publicar portas db/ml-api + secrets para `.env` (`compose.yaml`).
6. Pré-embutir `yolo11n.pt` (`ml-api/Dockerfile`).
7. Filtro `model_version` + guard de double-submit.

## Top riscos
1. **Data store aberto (LGPD):** sem auth/authz; `privacy_level` nunca lido; `ml-api:8000` e `db:5432` publicados no host. Quem adivinhar um `placeId` baixa todas as fotos (com rostos/placas/local incidentais). **Maior risco — bloqueia onboarding real.** (Fases C + B.)
2. **Sem migração:** `db/init` só roda em volume vazio. Toda tabela das Fases C-H fica bloqueada/destrutiva até o Alembic. (Fase B.)
3. **Foto base64 completa no Postgres, servida sem auth:** privacidade + bloat de DB + payloads multi-MB + quebra de localStorage, tudo da mesma raiz. (B + D.)
4. **Event loop bloqueado:** uma inferência serializa o serviço; healthcheck oscila sob carga. (Fase A.)
5. **Teto de acurácia do ML:** features genéricas do MobileNet ImageNet são fracas para re-identificação individual da mesma espécie. O enquadramento "sugere, não decide" está correto; planejar re-ID fine-tuned. Hoje os seed embeddings one-hot impedem até demonstrar o match.
6. **Dupla fonte de verdade:** a escrita incondicional no localStorage vaza estado entre lugares/usuários assim que o multi-lugar entrar. (Reconciliar na Fase A.)

## Arquivos que o roadmap mais toca
`src/components/SightingComposer.tsx`, `src/hooks/usePawDexStore.ts`, `src/app/api/{analyze-sighting,detect,confirm-sighting,pawdex/state}/route.ts`, `src/components/PawDexApp.tsx`, `ml-api/app/{main,repository,detection,matching,embedding}.py`, `ml-api/Dockerfile`, `Dockerfile`, `next.config.mjs`, `compose.yaml`, `db/init/{001_schema,002_seed}.sql`.
