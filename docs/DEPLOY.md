# Publicação online e Android da NA Barbearia

O site e a API compartilham `https://na-barbearia.duckdns.org`. O APK abre `/equipe`;
a landing page e os fluxos de cliente permanecem no site. A aplicação exige internet.

## Infraestrutura inicial

VM Oracle Always Free `VM.Standard.E2.1.Micro`, Ubuntu 24.04 AMD64, 1 GB de RAM, 50 GB de disco.
O backend é compilado no GitHub, nunca na VM. Confira a franquia disponível da sua conta antes de criar recursos;
capacidade e permanência da VM gratuita seguem as regras da Oracle.

1. Aponte o IPv4 do DuckDNS para o IP público da VM.
2. Na security list da subnet, permita TCP 80 e 443 de `0.0.0.0/0`. Mantenha SSH acessível ao operador e ao CI.
3. Copie `deploy/bootstrap.py` e `deploy/operations.py` para uma pasta temporária na VM.
4. Execute no Ubuntu:

```bash
sudo python3 /tmp/nabarbearia-bootstrap/bootstrap.py na-barbearia.duckdns.org
```

O bootstrap instala Caddy e um virtualenv com SDK OCI, configura HTTPS, libera HTTP/HTTPS no firewall Linux,
cria o usuário de serviço e os timers. Pode ser repetido sem regenerar tokens ou substituir o banco.
Alterações futuras nos arquivos de infraestrutura precisam de nova execução desse bootstrap pelo operador.

Arquivos do servidor:

| Local | Conteúdo |
| --- | --- |
| `/opt/nabarbearia/releases/<revision>` | Binário Linux, `dist` e identificação da versão |
| `/opt/nabarbearia/current` | Link para a versão ativa |
| `/etc/nabarbearia/backend.env` | Configuração privada e token de bootstrap |
| `/var/lib/nabarbearia/nabarbearia.db` | Banco persistente |
| `/var/lib/nabarbearia/backups` | Cópias locais privadas |
| `/var/lib/nabarbearia/android/NA-Barbearia-arm64-release.apk` | APK servido somente após autenticação da equipe |

A porta 3001 fica em loopback; o Caddy é a entrada pública. O banco nunca fica dentro de `dist`.

## Backups privados no Object Storage

Na região da VM, crie o bucket **privado** `nabarbearia-backups`, tier Standard, sem versionamento/replicação.
O código usa a identidade da instância, sem chave API de usuário. Em IAM → Domains → Default → Dynamic groups,
crie `nabarbearia-vm` com esta regra, substituindo pelo OCID da sua instância:

```text
ALL {instance.id = 'OCID_DA_VM'}
```

Crie uma policy no compartimento raiz com:

```text
Allow dynamic-group nabarbearia-vm to read objectstorage-namespaces in tenancy
Allow dynamic-group nabarbearia-vm to read buckets in tenancy where target.bucket.name = 'nabarbearia-backups'
Allow dynamic-group nabarbearia-vm to manage objects in tenancy where target.bucket.name = 'nabarbearia-backups'
```

O grupo permite leitura, escrita e limpeza de backups somente nesse bucket. Se usar outro identity domain,
qualifique o nome do grupo na policy. Aguarde a propagação das permissões antes de testar.

O namespace é descoberto automaticamente. Caso necessário, configure `OCI_NAMESPACE` em
`/etc/nabarbearia/backup.env`; o nome do bucket fica em `OCI_BUCKET` no mesmo arquivo.

O timer cria backup às **03h America/Sao_Paulo**. Cada publicação também cria backup antes de mudar o código.
A cópia usa a API de backup do SQLite para incluir WAL, verifica integridade e registra contagens/migrações.
Após upload, o arquivo é lido novamente do bucket e seu SHA-256 é conferido. Retenção: sete dias, local e remota.
Confira o uso do armazenamento para permanecer na franquia gratuita.

```bash
sudo nabarbearia backup
sudo nabarbearia test-restore ID_DO_BACKUP
sudo systemctl list-timers 'nabarbearia-*'
sudo journalctl -u nabarbearia-backup.service --no-pager
```

`test-restore` baixa o backup remoto, verifica checksum, integridade e contagens e inicia uma API temporária
na porta local 3012, com banco separado e o usuário de serviço. Não substitui a base em uso.

## Importação única do banco atual

No PowerShell, na raiz do projeto:

```powershell
python deploy/operations.py export backend/data/nabarbearia.db artifacts/initial-online.db --revoke-sessions
```

Envie esse snapshot por SCP para um arquivo temporário privado da VM. Então:

```bash
sudo nabarbearia import /tmp/initial-online.db
rm /tmp/initial-online.db
```

A exportação é consistente mesmo com WAL e invalida sessões somente na cópia. Contas, hashes de senha e
agendamentos permanecem. A importação é recusada quando já existe banco ou release, evitando sobrescrever
dados em atualizações futuras. Nenhum banco ou segredo faz parte do pacote de publicação.

## Publicação pelo GitHub Actions

Repositório: `Leandro-Santana013/Nabarbearia`, branch `master`.

Gere uma chave SSH dedicada ao CI e instale apenas sua chave pública usando:

```bash
sudo python3 authorize-ci.py /tmp/nabarbearia-ci.pub
```

O usuário `nabarbearia-deploy` pode enviar o pacote por SCP e executar, via sudo, somente o comando de
publicação. A chave pessoal do operador não deve ser entregue ao GitHub. Cadastre em Settings → Secrets and variables → Actions:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variable | `DEPLOY_HOST` | IP público da VM |
| Variable | `DEPLOY_USER` | `nabarbearia-deploy` |
| Variable | `DEPLOY_DOMAIN` | `na-barbearia.duckdns.org` |
| Secret | `DEPLOY_SSH_KEY` | Chave privada dedicada ao CI |
| Secret | `DEPLOY_KNOWN_HOSTS` | Linha da chave de host SSH verificada para o IP usado |

Use a chave de host já validada pelo operador. Não substitua isso por aceitação automática de qualquer host.
Somente pessoas com permissão de publicação devem poder alterar o workflow ou o código entregue.

Para atualizar: commit/push para `master` → Actions → **Publicar demonstração** → **Run workflow**.
O workflow é manual, serializado e restrito à branch `master`. Executa testes unitários, Clippy, testes de backup
e os fluxos reais de cliente, dono e equipe no Chrome; compila Linux AMD64 e envia o pacote.
Runners padrão de repositórios públicos são gratuitos; não habilite runners pagos para essa demonstração.

Durante a troca, o site responde 503 com `Retry-After`. O backend é parado, um backup privado é verificado,
o link da versão é trocado e o serviço reinicia aplicando migrações. Se o health falhar, o código anterior
e seu snapshot anterior às migrações são recuperados antes de reabrir o tráfego. Se a recuperação também falhar,
a manutenção permanece ativa para impedir novas gravações sobre uma base incerta.

O resultado deve ser HTTP 200 em `https://na-barbearia.duckdns.org/api/v1/health` com `status: ok`.
As telas novas são carregadas ao reabrir o app. Publicar a mesma revisão já saudável não repete a troca.

## Restauração solicitada pelo operador

```bash
sudo nabarbearia restore ID_DO_BACKUP
```

Esse comando substitui a base atual pelos dados daquele momento: só execute quando a perda das alterações
posteriores tiver sido aceita. Ele primeiro preserva o estado atual e restaura também a versão de código
registrada no backup, evitando misturar banco antigo e aplicação incompatível. A release correspondente
deve continuar disponível no servidor. Backups da importação inicial, ainda sem uma release, podem ser
usados para teste, mas não para esse rollback automático.

## DuckDNS automático

Crie `/etc/nabarbearia/duckdns.env`, proprietário root e permissão 600:

```text
DUCKDNS_DOMAIN=na-barbearia
DUCKDNS_TOKEN=SEU_TOKEN_PRIVADO
```

O timer já instalado atualiza a cada cinco minutos, detectando o IP a partir da própria VM.
Sem esse arquivo, a atualização automática é pulada; o apontamento manual continua válido.
Não coloque o token em arquivos versionados, comandos registrados no histórico ou no chat.

## APK e atualizações nativas

No Windows, mantenha Android SDK/NDK, JDK e o toolchain GNU usados pelo projeto:

```powershell
npm ci
npm run android:build
```

O APK abre `https://na-barbearia.duckdns.org/equipe`. O build preserva `br.com.nabarbearia.app` e exige os
arquivos existentes `nabarbearia-release.p12` e `keystore.properties`. Nunca gere outra assinatura para
atualizar o app já instalado. Guarde ambos em backup privado. `android:signing` fica reservado para criar
a assinatura de uma instalação inicial inteiramente nova.

Antes de uma versão nativa, aumente a versão em `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`;
confira que o versionCode será superior ao instalado. Compare os certificados dos APKs com `apksigner`.
O script mantém os caches de compilação fora do caminho Windows com acentos.

Envie `artifacts/NA-Barbearia-arm64-release.apk` ao servidor e instale-o, com proprietário `nabarbearia`,
no diretório Android privado indicado acima. A equipe pode abrir `/equipe/download` no navegador, entrar
e baixar o APK. O endpoint `/api/v1/staff/android/apk` exige sessão de dono ou barbeiro e transmite o arquivo
sem carregar o APK inteiro na memória. No Android moderno, o download dentro do app mantém a sessão.
A pessoa confirma a instalação no sistema; a atualização nativa não é silenciosa.

Primeiro valide no celular atual: sem cabo, Wi-Fi/4G, login, reabertura, logout, navegação, falha de rede,
WhatsApp e atualização sobre a versão anterior. O erro inicial de conexão possui uma tela nativa de tentativa
novamente. Site e conta de cliente continuam pelo navegador.

## Diagnóstico e verificações

```bash
sudo systemctl status nabarbearia caddy --no-pager
sudo journalctl -u nabarbearia -n 50 --no-pager
curl --fail http://127.0.0.1:3001/api/v1/health
curl --fail https://na-barbearia.duckdns.org/api/v1/health
```

Se HTTPS não responder, verifique DNS, regras 80/443 na security list e no firewall Linux e logs do Caddy.
Se o backup falhar por permissão OCI, confira bucket privado, matching rule da instância e policy;
a publicação será interrompida antes da atualização. Evite divulgar logs com dados de clientes ou credenciais.
