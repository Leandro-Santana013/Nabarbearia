# Resultado F5 — contrato de entrega web/Android

Data: 29/10/2026. Implementação e verificações locais concluídas no Windows. **Gate 5 tem aceite local; recuperação Linux e aceite externo permanecem pendentes.** Escopo autorizado pelo pedido explícito de executar F5. Alterações anteriores F0–F4 preservadas; sem commit, push, workflow acionado, instalação administrativa ou publicação.

## Entrega

- `tests/fixtures/android-release/cases.json`: 34 amostras comuns a Node, TypeScript, Rust e Python, incluindo limites, números integrais JSON, tipos incorretos, campos ausentes, HTML e hash com quebra de linha. A política e os comandos estão em [RELEASE-VALIDATION](RELEASE-VALIDATION.md).
- `scripts/release/android-release.mjs`: preparação sobre snapshot do APK real, inspeção com `aapt` e `apksigner`, pacote e certificado único aprovados, versão embutida comparada com `tauri.properties`, tamanho/hash e saída APK → manifesto. O comando existente `android:build` executa essa política e exige `NABARBEARIA_ANDROID_CERT_SHA256`. Ausência do APK deixa de terminar silenciosamente com sucesso.
- `src/lib/android-update.ts` e `backend/src/android_release.rs`: contratos coerentes para os consumidores; campos futuros ignorados. O backend abre o APK e verifica tamanho/hash antes do anúncio. Manifesto presente sem APK ou com hash incorreto falha, em vez de retornar ausência de atualização. Sem manifesto, 204 conserva o significado de nenhum APK anunciado. Download e manifesto usam `no-store`; autorização da equipe preservada.
- `deploy/operations.py`: `package-web` gera revisão, inventário/hash, `DELIVERY.json`, pacote e checksum; extração confere revisão/protocolo/inventário antes da manutenção. Artefatos privados conhecidos e membros inseguros são recusados. O pacote contém apenas backend, dist, REVISION e DELIVERY.json.
- `capabilities` e `check-helper`: protocolo administrativo 2, conferido pelo workflow antes do envio. O helper continua standalone e instalado pelo administrador; o pacote não leva código privilegiado e nenhuma permissão sudoers foi ampliada. Helper antigo falha no preflight; atualizar somente o workflow não instala o helper.
- `install-android`: comando administrativo sob o lock já usado pelo deploy. Valida origem e cópia antes da troca, configura leitura privada, conserva backup e instala APK antes do manifesto. Uma exceção no anúncio restaura o par anterior. Interrupção abrupta e recuperação manual do backup estão documentadas; o backend recusa par divergente.
- Workflow manual passou a usar a política real de empacotamento e os testes de contrato/atualizador. Web/backend e Android continuam independentes; nenhuma compilação nativa é necessária apenas para publicar a interface.

## Evidências

Logs, snapshot de partida, captura e pacote de ensaio em [artifacts/arquitetura-f5-2026-10-29](../artifacts/arquitetura-f5-2026-10-29/), ignorados pelo Git.

| Verificação | Resultado |
| --- | --- |
| Fixtures Node e preparação | **35/35**; `final-node.log` |
| Frontend | **118/118**, 16 arquivos; `final-frontend-test.log` |
| Build frontend | Passou; `final-frontend-build.log`. Aviso existente de chunk acima de 500 kB, sem otimização de bundle nesta fase |
| Rust | **30/30**; `final-rust.log`. Nova suíte de fixtures e testes HTTP existentes reforçados para hash/cabeçalhos |
| Rust fmt, Clippy e build | Passaram com GNU Windows, incluindo Clippy `--all-targets -- -D warnings`; `fmt.log`, `clippy.log`, `build-rust.log` |
| Operações Python | **12 passaram, 2 ignorados no Windows**, total 14; `final-python.log`. Recuperação web com symlinks exige Linux |
| APK existente, ferramentas reais | `aapt` + `apksigner` verificaram pacote, versão 0.2.2/2002, assinatura aprovada, tamanho 11241515 e SHA-256 `c9573d2f43e68de61eaf3330b38de051591c14632eccf43289c35fecd872599d`; `apk-inspection.json`. Sem recompilar/instalar APK |
| Empacotamento real de ensaio | `local-web.tar.gz` e checksum gerados com o binário Windows e dist atual. **Ensaio local, não é pacote Linux publicável** |
| Atualizador com API/Chrome reais | Passou: navegador comum, versão anterior/atual, login da equipe para atualizar, corrupção com mesmo tamanho, nova tentativa após recuperação e 204; `flow-android-update.log` |
| Regressão de uso | Cliente/barbeiro, proprietário, equipe, acesso e reserva passaram sequencialmente com backend recompilado e SQLite temporário; `flow-{client,owner}.log`, `final-flow-{staff,access,booking}.log` |
| Apresentação | Captura do atualizador em 320 px inspecionada, sem overflow horizontal, ação alcançável; `capturas/update-320.png`. Nenhum componente visual/CSS fonte alterado |
| Diff e sintaxe | `git diff --check`, sintaxe Node e compilação Python passaram |

Os testes de operações verificam revisão/protocolo/hash divergentes, rejeição do arquivo extra privado, anúncio incompleto antes de parar o serviço, ordem APK → manifesto, recusa de tamanho/hash incorreto e recuperação do par anterior após falha induzida no anúncio. Propriedade/grupo são simulados nesses testes Windows; permissões reais e recuperação web continuam no aceite Linux.

O fluxo de equipe também verifica retorno ao app, falha de rede, falha de download simulada, versão instalada superior, WebView antigo e restrições de download. Eventos simulados verificam a reação da interface; não certificam o instalador Android. Os testes Rust existentes mantêm 401 anônimo, 403 para cliente e download autenticado pela equipe.

## Revisão e limites

Revisão sequencial pelo mesmo agente, com passe estrutural separado; sem revisão independente.

**Gate 5: attempt 1 of 3.** Identificados e reconciliados: expressão JavaScript precisava rejeitar hash terminado em quebra de linha; inspeção `aapt` falhava com caminho absoluto acentuado; inspeção e cópia precisavam usar o mesmo snapshot; fixture antiga da equipe anunciava hash fictício. Adicionadas verificações de artefato privado no pacote, corrupção do arquivo empacotado e falha antes da parada do serviço. Um erro inicial de regex no teste Python foi corrigido, sem alterar política de produto.

**Gate 5: attempt 2 of 3.** Fixtures coerentes nas quatro linguagens, APK real inspecionado, pacote local preparado, recuperação Android induzida passou, seis fluxos reais passaram e ferramentas locais passaram. Inspeção de dependências: contrato Rust sem HTTP/storage; handlers fazem leitura/hash e adaptação HTTP; Node concentra a política de preparação; workflow consome a operação Python sem duplicar layout/ordem; código privilegiado permanece fora do pacote e sudoers inalterado. Sem achado material remanescente no escopo local.

O primeiro frontend falhou ao carregar `vite.config.ts` por restrição de leitura do ancestral no sandbox. Testes/build passaram com execução liberada, sem mudar configuração. WSL não está instalado e não há Docker disponível; não se executou nem se certificou Linux. O workflow manual está preparado para executar os testes Linux quando for autorizado.

Não houve acesso ao banco real, servidor ou produção. Nenhuma revisão online atual foi certificada. Não houve novo build nativo, teste em aparelho ou instalação do helper. A verificação de cancelamento/instalação/retomada e Wi-Fi/4G sobre a versão anterior com a mesma assinatura permanece externa. A passagem para protocolo 2 exige a instalação administrativa descrita no checklist antes da próxima publicação.
