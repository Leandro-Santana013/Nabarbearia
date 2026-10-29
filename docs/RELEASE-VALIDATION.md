# Entrega das correções de atualização e mensagens

## Diagnóstico histórico confirmado em 29/10/2026

A publicação estava na revisão `712e0a613ab6829e0ebdc614057fbdee5c746dcb-40376182942-1`.
Esse commit ainda não registra `/api/v1/staff/android/release`. A consulta HTTP direta a
`127.0.0.1:3001` na VM retornou HTML, assim como o domínio público. O backend antigo
encaminha a rota ausente à interface; o proxy não é a causa observada.

O backend atual já implementa o manifesto. A correção da publicação exige entregar
esse backend junto da interface atual. Nenhuma publicação foi executada nesta rodada.

## Preparar e verificar

Execute os testes de frontend, backend, operações e os fluxos de navegador conforme o README.
O workflow manual **Publicar demonstração**, com `publish=false`, gera o pacote Linux
com a revisão selecionada. Ele só inclui `backend`, `dist`, `REVISION` e `DELIVERY.json`, preservando
o banco, segredos, assinatura Android e arquivos privados fora do pacote.

O APK local `0.2.2` (`2002`) foi conferido contra `artifacts/release.json`:

- tamanho: `11241515` bytes;
- SHA-256: `c9573d2f43e68de61eaf3330b38de051591c14632eccf43289c35fecd872599d`;
- certificado SHA-256: `f2c706099c3bbb66fc204751ab962129a885f7e2502075b34c570493c3185d16`;
- certificado igual ao APK anterior preservado em `artifacts/NA-Barbearia-before-online.apk`.

Estas correções não alteram código nativo. Não gerar outro APK apenas para publicar
as mensagens. Antes da atualização no aparelho, conferir a versão instalada e manter
a mesma assinatura; nunca criar outra chave para substituir a existente.

## Aplicação no servidor — etapa posterior, com autorização

1. Após revisão e autorização de commit/push, disponibilizar a revisão com as correções.
2. Um administrador deve atualizar **somente** o helper de operações, usando a cópia
   revisada de `deploy/operations.py`. O usuário de deploy não deve receber permissão
   de substituir livremente código executado como root. Exemplo, após transferência
   autorizada para uma pasta de preparação:

   ```bash
   sudo install -o root -g root -m 0755 operations.py /opt/nabarbearia/ops/operations.py
   /usr/local/sbin/nabarbearia capabilities
   ```

   O resultado deve incluir `"delivery_protocol": 2`. O workflow consulta esse comando sem sudo e recusa helper ausente/incompatível antes do envio. `DELIVERY.json` exige o mesmo protocolo, revisão e hashes na extração antes da manutenção. A recuperação pode voltar a releases antigas já instaladas; pacotes novos exigem o protocolo 2. O helper permanece standalone; nenhuma dependência Python nova precisa ser instalada.

3. Conferir os arquivos Android privados e a leitura pelo usuário `nabarbearia`.
   Caso seja necessário atualizar o par aprovado, um administrador executa:

   ```bash
   sudo /usr/local/sbin/nabarbearia install-android /caminho/privado/preparado
   ```

   A operação usa o mesmo lock da publicação web, copia e valida antes de tocar a versão atual, configura leitura para o grupo `nabarbearia`, retém a cópia anterior em diretório privado e troca **APK antes do manifesto**. Se o anúncio falhar, retira o manifesto e restaura o par anterior. Uma interrupção abrupta pode deixar o par divergente: o backend recusa o anúncio, e o administrador deve restaurar o backup validado. O diretório final é `/var/lib/nabarbearia/android/`; arquivos não devem ficar em `dist`. Nenhuma nova regra sudoers foi concedida ao usuário de deploy.
4. Executar o workflow manual com publicação habilitada. O helper atualizado mantém
   backup antes da troca e agora valida manifesto/artefatos/proteção do APK antes de
   aceitar a versão. Uma falha aciona a recuperação do banco e da aplicação anterior.
5. O workflow também verifica o contrato pelo domínio público. Uma falha exclusiva
   no domínio reprova o job e exige investigação do proxy; essa verificação externa
   não executa uma segunda troca de banco automaticamente.

**Importante:** atualizar o helper na VM faz parte da preparação operacional. Alterar
somente o workflow não instala o helper novo. Até essa instalação, o script antigo
continua tendo apenas a verificação de saúde no processo de rollback.

## Verificação de contrato

Sem credenciais ou privilégios administrativos, na máquina do operador:

```powershell
python deploy/operations.py verify-release --origin https://na-barbearia.duckdns.org
```

Quando houver um APK que deve estar anunciado, usar os artefatos locais aprovados:

```powershell
python deploy/operations.py verify-release --origin https://na-barbearia.duckdns.org --android-dir artifacts --require-published
```

O comando verifica JSON, metadados, ausência de cache e restrição do download anônimo.
Com `--android-dir`, também compara tamanho e SHA-256 do APK local e os metadados da
publicação. Ele não baixa o APK privado nem substitui um teste autenticado.

HTTP 204 só passa quando nenhuma publicação é exigida; esse resultado significa
**nenhum APK anunciado**. HTML 200 sempre reprova. Artefatos incompletos, tamanho ou
hash divergentes impedem a aceitação pelo helper no servidor.

## Contrato local de F5

`tests/fixtures/android-release/cases.json` contém os mesmos 34 casos usados por Node, TypeScript, Rust e Python. Versão: inteiro positivo até `2147483647`; tamanho: inteiro positivo até `9007199254740991`; nome não vazio após trim; SHA-256 minúsculo com exatamente 64 caracteres. Campos futuros são aceitos e desconsiderados. HTML, tipos incorretos, frações, dados incompletos e hashes com quebra de linha são recusados. O endpoint Rust também calcula o hash do APK antes de anunciar; uma troca parcial falha sem liberar o aplicativo. Manifesto e download autenticado usam `no-store`.

`scripts/release/android-release.mjs` concentra inspeção do APK assinado, pacote `br.com.nabarbearia.app`, certificado aprovado, comparação da versão com `tauri.properties` e preparação APK → manifesto. `android:build` executa essa política ao terminar e falha se o APK esperado não existir. Defina `NABARBEARIA_ANDROID_CERT_SHA256` conforme o README. O snapshot temporário permite inspecionar e copiar os mesmos bytes, inclusive em checkouts Windows com acentos. O instalador nativo continua verificando pacote, versão crescente e assinatura; seu código não foi alterado no F5.

`deploy/operations.py package-web` prepara revisão, inventário, pacote e checksum; o workflow usa a mesma operação que os testes. Exemplo após compilar **em Linux**, com um identificador de revisão novo:

```bash
python3 deploy/operations.py package-web --backend backend/target/release/nabarbearia-backend --dist dist --revision "$RELEASE_ID" --output release.tar.gz
```

O helper recusa revisão divergente, inventário/hash alterado, protocolo incompatível e artefatos privados conhecidos no pacote. A presença de `DELIVERY.json` não certifica a arquitetura do binário: o workflow compila Linux AMD64. Um pacote de teste gerado no Windows não serve para instalar no servidor Linux.

| Estado | Evidência necessária |
| --- | --- |
| Preparado localmente | Testes, assinatura/versão e tamanho/hash do par; nenhuma consulta à produção implícita |
| Empacotado | Pacote Linux, revisão, protocolo e inventário conferidos; ainda não publicado |
| Publicado | Helper compatível instalado administrativamente, revisão implantada, saúde e manifesto/proteção conferidos no domínio |
| Validado no aparelho | Atualização sobre a versão anterior, mesma assinatura, instalação/cancelamento/falha/retomada e Wi-Fi/4G |

Verificações: `npm.cmd run test:release`, `npm.cmd test`, `npm.cmd run build`, testes Rust e `python -m unittest discover -s deploy -p test_operations.py -v`. Após build frontend/backend, `node scripts/check-android-update-flow.mjs` usa Chrome/API/SQLite isolados para verificar navegador comum, versão anterior/atual, corrupção/recuperação e 204. Os dois testes de recuperação web com symlinks são executados em Linux no workflow manual e ignorados no Windows. Nenhum desses testes substitui instalação no Android.

## Aceite no aparelho

Com um Android disponível, validar atualização sobre a versão anterior, dados/sessão,
cancelamento da instalação, falha de rede, retorno do segundo plano e Wi-Fi/4G.
O navegador deve continuar abrindo normalmente. Sem esse teste, o instalador nativo
permanece pendente, mesmo com testes locais e manifesto corretos.
