# Entrega das correções de atualização e mensagens

## Diagnóstico confirmado em 29/10/2026

A publicação estava na revisão `712e0a613ab6829e0ebdc614057fbdee5c746dcb-40376182942-1`.
Esse commit ainda não registra `/api/v1/staff/android/release`. A consulta HTTP direta a
`127.0.0.1:3001` na VM retornou HTML, assim como o domínio público. O backend antigo
encaminha a rota ausente à interface; o proxy não é a causa observada.

O backend atual já implementa o manifesto. A correção da publicação exige entregar
esse backend junto da interface atual. Nenhuma publicação foi executada nesta rodada.

## Preparar e verificar

Execute os testes de frontend, backend, operações e os fluxos de navegador conforme o README.
O workflow manual **Publicar demonstração**, com `publish=false`, gera o pacote Linux
com a revisão selecionada. Ele só inclui `backend`, `dist` e `REVISION`, preservando
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
   ```

3. Conferir os arquivos Android privados e a leitura pelo usuário `nabarbearia`.
   Caso seja necessário atualizar os artefatos, preservar os anteriores, usar nomes
   temporários, validar tamanho/SHA-256 e trocar por renomeação: **APK antes do manifesto**.
   O diretório é `/var/lib/nabarbearia/android/`; arquivos não devem ficar em `dist`.
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

## Aceite no aparelho

Com um Android disponível, validar atualização sobre a versão anterior, dados/sessão,
cancelamento da instalação, falha de rede, retorno do segundo plano e Wi-Fi/4G.
O navegador deve continuar abrindo normalmente. Sem esse teste, o instalador nativo
permanece pendente, mesmo com testes locais e manifesto corretos.
