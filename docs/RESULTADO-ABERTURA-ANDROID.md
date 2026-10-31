# Abertura do Android — resultado de 30/10/2026

## Comportamento aprovado

No Galaxy M62 (SM-M625F, Android 13), o APK 0.2.4/2004 mantém a logo até a
agenda estar pronta. O retorno do segundo plano preserva o painel e revalida a
sessão. A página só recarrega quando o bundle publicado mudou; sessões expiradas
continuam removendo o acesso. A instalação por USB preservou a conta e seus dados.

`AppStartup.kt` cobre a WebView e conserva o splash do sistema no Android 12+.
A interface publica `data-na-ready="true"` após sessão, dados iniciais e fontes;
a logo sai após `WebView.postVisualStateCallback`. Não há espera mínima artificial.
Falhas liberam a recuperação; o limite de inicialização de 25 s evita logo presa.
Download e bloqueio de atualização obrigatória mantêm os controles existentes.

## Evidências físicas

| Gravação em `artifacts/android-startup-20261030/` | Amostras a 30/s | Resultado |
| --- | ---: | --- |
| `before-analysis` — APK/interface antigos | 18 pretas | Reproduziu a piscada preta (600 ms amostrados) |
| `logo-before-analysis` — correção intermediária | 14 vazias | Reproduziu intervalo claro (aproximadamente 467 ms) |
| `logo-final-cold-full` — abertura, modo escuro | 338 | Logo diretamente à agenda; zero preto/fundo vazio |
| `logo-final-return` — retorno do segundo plano | 22 | Painel preservado, sem reapresentar a logo; zero preto/fundo vazio |
| `logo-final-light-cold` — abertura, modo claro | 436 | Terminou na agenda pronta; zero preto/fundo vazio |

O modo escuro original foi restaurado. A verificação anterior de preto/texto era
insuficiente para detectar o fundo vazio e o aviso posterior “Carregando agenda…”.
As gravações finais foram inspecionadas visualmente até o painel pronto.
`logo-ready-cold` e `logo-final-cold` terminaram na logo e não validam a transição.
`session-silent-cold` e `session-silent-cold-awake` capturaram a tela em descanso
(`Dozing`), não uma regressão do aplicativo. O gravador agora rejeita esse estado.
O modo `warm` do script significa retorno via Home, classificado como `HOT` pelo
Android; a abertura após encerrar o processo é classificada como `COLD`.

## Repetir os testes

Com o telefone desbloqueado e autorizado para depuração USB, sem limpar dados:

```powershell
npm.cmd run test:android-startup-flow
python scripts/check-android-startup.py --serial SERIAL --duration 30 --no-empty-loading --expect-dashboard --output-dir artifacts/startup-logo
python scripts/check-android-startup.py --serial SERIAL --mode warm --duration 10 --no-empty-loading --expect-dashboard --output-dir artifacts/startup-return
```

O fluxo de abertura concentra os testes de sessão silenciosa (visitante, barbeiro
e proprietário), fundo inicial claro, prontidão após dados, painel preservado na
retomada e recuperação de erro. Os fluxos de acesso, equipe e atualização cobrem
permissões, expiração, login, consulta silenciosa e bloqueio obrigatório.

O gravador requer ADB, FFmpeg e Pillow. Amostra a 30 quadros/s, detecta preto e
fundo vazio e pode exigir conteúdo além da logo. Esses limiares são heurísticas:
o resultado numérico exige inspeção visual. Não altera rede nem limpa dados.
Vídeos e capturas ficam locais e podem conter a interface da conta conectada.

## Entrega e reversão

A interface aprovada está na revisão `d1795d1-ui-logo-20261030-04`, bundle
`index-1suIM7Ft.js`, com backup local/remoto `20261031T000344105775Z` (UTC).
O helper verificou saúde e proteção do APK. O backend foi preservado, SHA-256
`8f4e9ab4c984933c6911952277c349f64e665adbef4290b5d2af881d93a2963a`.
As revisões intermediárias `...-01`, `...-02` e `...-03` também usaram backups.

O APK aprovado antes da simplificação tem SHA-256
`bf66cd1f6b81045524b433c16ac9a30996014089cc7da695acb32b9de4ab4b4d`.
O servidor continua anunciando 0.2.2/2002; o APK 0.2.4 foi instalado neste celular,
sem distribuição aos demais aparelhos. A variante QA e os túneis foram removidos.
Não houve commit ou push.

O estado anterior à simplificação, incluindo os quatro arquivos alterados, APK,
manifesto, hashes, diff e relatório completo, foi preservado em
`artifacts/startup-simplify-20261030-212528/`. A pasta `before/` permite restaurar
esses arquivos sem desfazer as demais mudanças locais do projeto. Os vídeos
originais permanecem em `artifacts/android-startup-20261030/`.

A validação da simplificação, os hashes e as novas gravações estão em
`artifacts/startup-simplify-20261030-212528/validation.json` e suas pastas `cold/` e `return/`.

Referências: [splash do Android](https://developer.android.com/develop/ui/views/launch/splash-screen),
[controle da saída](https://developer.android.com/reference/android/window/SplashScreen) e
[estado visual da WebView](https://developer.android.com/reference/android/webkit/WebView#postVisualStateCallback(long,%20android.webkit.WebView.VisualStateCallback)).
