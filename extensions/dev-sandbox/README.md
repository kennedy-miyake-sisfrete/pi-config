# Dev Sandbox

Sandbox de desenvolvimento via bubblewrap + seccomp para pi.

## Instalação

```bash
# Requer bubblewrap (Linux)
sudo apt install bubblewrap

# A extensão já está em ~/.pi/agent/extensions/dev-sandbox/
# Carregue normalmente ao iniciar o pi.
```

## Arquitetura de Proteção (2 camadas)

```
┌─────────────────────────────────┐
│ security-guard.ts (EXISTENTE)   │ ← Soft boundary
│  Pattern matching de comandos   │   Bloqueia padrões perigosos
│  Verificação de paths sensíveis │   Pede confirmação ao usuário
├─────────────────────────────────┤
│ dev-sandbox (NOVO)              │ ← Hard boundary
│  bwrap: namespaces do kernel    │   Filesystem isolado
│  seccomp: bloqueio de syscalls  │   Syscalls perigosas negadas
└─────────────────────────────────┘
```

## O que é isolado

| Ferramenta | Dentro do sandbox? |
|---|---|
| `read` | ✅ cat via bwrap |
| `write` | ✅ mkdir + cat via bwrap |
| `edit` | ✅ edit composto via bwrap |
| `bash` | ✅ bash -lc via bwrap |
| `grep` | ✅ rg via bwrap |
| `find` | ✅ find via bwrap |
| `ls` | ✅ stat + ls via bwrap |
| `!comando` | ✅ user bash via bwrap |

## Filesystem

```
Montado read-only:
  /usr, /bin, /lib, /lib64       → sistema de desenvolvimento
  /etc/resolv.conf, hosts, …      → rede e usuários
  ~/.ssh                          → chaves SSH (sem acesso direto aos arquivos)

Montado read-write:
  $PWD                            → diretório do projeto
  .sandbox-cache/npm, pip         → cache persistente

Montado vazio (tmpfs):
  /sbin, /usr/sbin, /root         → ferramentas de sistema bloqueadas

NÃO montado:
  ~ (home real)                   → sem .aws, .gnupg, .bash_history
  /etc (completo)                 → sem shadow, sudoers, pam.d
  Dispositivos de bloco           → sem /dev/sda
```

## Seccomp (20 syscalls bloqueadas)

mount, umount2, pivot_root, chroot, setns, unshare,
reboot, kexec_load, init_module, delete_module,
ioperm, iopl, swapon, swapoff, ptrace,
process_vm_readv, process_vm_writev, nfsservctl,
syslog, bpf

## Configuração

### Global (`~/.pi/agent/extensions/dev-sandbox.json`)

```json
{
  "enabled": true,
  "internet": { "enabled": true },
  "filesystem": {
    "extraWritable": [],
    "extraReadonly": [],
    "denyPaths": ["/sbin", "/usr/sbin", "/root"],
    "cacheDirs": { "npm": "", "pip": "" }
  },
  "seccomp": { "enabled": true },
  "ssh": { "mountReadOnly": true }
}
```

### Projeto (`.pi/sandbox.json`)

Mesmo formato — sobrescreve campos do global.

Exemplo: `/meu-projeto/.pi/sandbox.json`

```json
{
  "internet": { "enabled": false },
  "filesystem": {
    "extraWritable": ["/var/run/docker.sock"]
  },
  "ssh": { "mountReadOnly": false }
}
```

## Comandos

| Comando | Descrição |
|---|---|
| Iniciar pi normalmente | Sandbox ativo por padrão |
| `pi --no-sandbox` | Desabilita sandbox para esta sessão |
| `/sandbox` | Mostra status e configuração atual |

## Cache de pacotes

Caches npm e pip são persistidos em `.sandbox-cache/` dentro do projeto.
Adicione ao `.gitignore`:

```gitignore
.sandbox-cache/
```

## Dependências

- **bubblewrap** (`apt install bubblewrap`) — obrigatório
- **ripgrep** (`apt install ripgrep`) — para tool grep
- Linux com `kernel.unprivileged_userns_clone=1`

## Limitações

- Linux apenas (bwrap depende de namespaces do kernel)
- Cada tool call cria/destrói um namespace (~30ms overhead)
- `/tmp` é efêmero entre comandos (use `$PWD` para persistência)
- `npm install` com scripts de lifecycle executa dentro do sandbox
  (seguro porque home real inacessível + seccomp ativo)
