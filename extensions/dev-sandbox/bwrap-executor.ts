/**
 * Core do sandbox — constrói argumentos bwrap e spawna o processo.
 *
 * Responsável por:
 *   - Montar a linha de comando bwrap baseada na SandboxConfig
 *   - Gerenciar ciclo de vida (timeout, abort, kill de grupo)
 *   - Coletar stdout/stderr com backpressure
 *   - Aplicar filtro seccomp (deny-list BPF)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, openSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { SandboxConfig, BwrapCall, BwrapResult } from "./types";

// ─── Seccomp BPF ──────────────────────────────────────────────

/** Syscalls bloqueadas — são operações de sistema que não fazem
 *  sentido dentro de um sandbox de desenvolvimento. */
const BLOCKED_SYSCALLS: number[] = [
  165, // mount
  166, // umount2
  155, // pivot_root
  161, // chroot
  308, // setns
  272, // unshare
  169, // reboot
  246, // kexec_load
  175, // init_module
  176, // delete_module
  173, // ioperm
  172, // iopl
  167, // swapon
  168, // swapoff
  101, // ptrace
  347, // process_vm_readv
  348, // process_vm_writev
  180, // nfsservctl
  103, // syslog
  321, // bpf
];

/**
 * Gera buffer BPF no formato struct sock_fprog:
 *   u16 len ; N × sock_filter (8 bytes cada)
 *
 * sock_filter (8 bytes):
 *   u16 code (LE)
 *   u8  jt
 *   u8  jf
 *   u32 k   (LE)
 *
 * Filtro: default ALLOW, bloqueia syscalls na lista.
 * Cada syscall bloqueada = 1 instrução JEQ → RET KILL.
 */
function buildSeccompFilter(): Buffer {
  const count = BLOCKED_SYSCALLS.length;
  // 1 instrução LD + N instruções JEQ + 1 RET ALLOW + 1 RET KILL
  const total = 1 + count + 2;
  const buf = Buffer.alloc(2 + total * 8);

  // Cabeçalho: número de instruções (u16 LE)
  buf.writeUInt16LE(total, 0);

  let offset = 2; // pula cabeçalho

  // Instrução 0: LD [0] — carrega número da syscall
  // BPF_LD | BPF_W | BPF_ABS = 0x20
  buf.writeUInt16LE(0x20, offset);       // code
  buf.writeUInt8(0, offset + 2);          // jt
  buf.writeUInt8(0, offset + 3);          // jf
  buf.writeUInt32LE(0, offset + 4);       // k=0 (offset 0 do seccomp_data)
  offset += 8;

  // Instruções JEQ para cada syscall bloqueada
  // O target sempre é a última instrução (RET KILL) que está
  // em count + 2 (índice 0-based)
  const killIdx = total - 1; // última instrução é RET KILL

  for (let i = 0; i < count; i++) {
    const currentIdx = i + 1; // 0-based (após LD)
    const jt = killIdx - (currentIdx + 1); // offset relativo ao próximo pc

    // BPF_JMP | BPF_JEQ | BPF_K = 0x15
    buf.writeUInt16LE(0x15, offset);       // code
    buf.writeUInt8(jt, offset + 2);         // jt → RET KILL
    buf.writeUInt8(0, offset + 3);          // jf → próxima instrução
    buf.writeUInt32LE(BLOCKED_SYSCALLS[i], offset + 4);
    offset += 8;
  }

  // RET ALLOW (penúltima instrução)
  // BPF_RET | BPF_K = 0x06, SECCOMP_RET_ALLOW = 0x7FFF0000
  buf.writeUInt16LE(0x06, offset);
  buf.writeUInt8(0, offset + 2);
  buf.writeUInt8(0, offset + 3);
  buf.writeUInt32LE(0x7FFF0000, offset + 4);
  offset += 8;

  // RET KILL (última instrução)
  // SECCOMP_RET_KILL = 0x00000000
  buf.writeUInt16LE(0x06, offset);
  buf.writeUInt8(0, offset + 2);
  buf.writeUInt8(0, offset + 3);
  buf.writeUInt32LE(0x00000000, offset + 4);

  return buf;
}

// ─── Gerenciamento de arquivo seccomp ─────────────────────────

let seccompFd: number | null = null;
let seccompFile: string | null = null;

/**
 * Inicializa o filtro seccomp — escreve BPF em arquivo temporário,
 * mantém fd aberto durante toda a sessão. O fd é herdado por cada
 * processo bwrap filho.
 */
export function initSeccomp(): number {
  if (seccompFd !== null) return seccompFd;

  seccompFile = join(tmpdir(), `pi-seccomp-${randomUUID()}.bpf`);
  writeFileSync(seccompFile, buildSeccompFilter());
  seccompFd = openSync(seccompFile, "r");
  return seccompFd;
}

/** Retorna o fd do seccomp ou -1 se não inicializado. */
export function getSeccompFd(): number {
  return seccompFd ?? -1;
}

/** Fecha fd e remove arquivo temporário. */
export function cleanupSeccomp(): void {
  try {
    if (seccompFd !== null) {
      const fs = require("node:fs");
      fs.closeSync(seccompFd);
      seccompFd = null;
    }
    if (seccompFile !== null) {
      try { unlinkSync(seccompFile); } catch { /* ignorar */ }
      seccompFile = null;
    }
  } catch { /* ignorar erros de cleanup */ }
}

// ─── Construção de argumentos bwrap ───────────────────────────

/**
 * Constrói o array de argumentos base do bwrap.
 * Estes argumentos são comuns a todas as tools.
 */
export function buildBwrapArgs(config: SandboxConfig, cwd: string): string[] {
  const home = process.env.HOME || "/root";
  const args: string[] = [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--tmpfs", "/run",
    // Sistema read-only
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/lib", "/lib",
  ];

  // /lib64 pode não existir
  if (existsSync("/lib64")) {
    args.push("--ro-bind", "/lib64", "/lib64");
  }

  // /etc seletivo — apenas arquivos necessários pra runtime
  const etcFiles = [
    "/etc/resolv.conf",
    "/etc/hosts",
    "/etc/passwd",
    "/etc/group",
    "/etc/nsswitch.conf",
  ];
  for (const f of etcFiles) {
    if (existsSync(f)) {
      args.push("--ro-bind", f, f);
    }
  }

  // Certificados TLS (necessários pra HTTPS)
  if (existsSync("/etc/ssl")) {
    args.push("--ro-bind", "/etc/ssl", "/etc/ssl");
  }
  if (existsSync("/etc/ca-certificates")) {
    args.push("--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates");
  }

  // Projeto read-write (ponto central do sandbox)
  args.push("--bind", cwd, cwd);

  // Rede do host
  if (config.internet.enabled) {
    args.push("--share-net");
  }

  // SSH (~/.ssh read-only)
  if (config.ssh.mountReadOnly) {
    const sshDir = join(home, ".ssh");
    if (existsSync(sshDir)) {
      args.push("--ro-bind", sshDir, sshDir);
    }
  }

  // Cache persistente (npm, pip)
  const npmDir = config.filesystem.cacheDirs.npm;
  if (npmDir) {
    mkdirSync(npmDir, { recursive: true });
    args.push("--bind", npmDir, join(home, ".npm"));
  }

  const pipDir = config.filesystem.cacheDirs.pip;
  if (pipDir) {
    mkdirSync(pipDir, { recursive: true });
    args.push("--bind", pipDir, join(home, ".cache", "pip"));
  }

  // Git config (necessário pra user.name/user.email em commits)
  const gitconfig = join(home, ".gitconfig");
  if (existsSync(gitconfig)) {
    args.push("--ro-bind", gitconfig, gitconfig);
  }

  // Paths negados — sobrescritos com tmpfs vazio
  for (const deny of config.filesystem.denyPaths) {
    args.push("--tmpfs", deny);
  }

  // Writable extras
  for (const p of config.filesystem.extraWritable) {
    if (existsSync(p)) {
      args.push("--bind", p, p);
    }
  }

  // Readonly extras
  for (const p of config.filesystem.extraReadonly) {
    if (existsSync(p)) {
      args.push("--ro-bind", p, p);
    }
  }

  // Seccomp
  if (config.seccomp.enabled) {
    const fd = getSeccompFd();
    if (fd >= 0) {
      args.push("--seccomp", String(fd));
    }
  }

  // HOME isolado
  args.push("--setenv", "HOME", home);
  args.push("--setenv", "USER", process.env.USER || "root");

  return args;
}

// ─── Execução ─────────────────────────────────────────────────

/**
 * Executa um comando dentro do sandbox bwrap.
 *
 * Cria um novo namespace bwrap, executa o comando, coleta
 * stdout/stderr, e retorna o resultado. O namespace é
 * destruído automaticamente quando o processo termina.
 */
export function execInSandbox(
  config: SandboxConfig,
  opts: BwrapCall,
): Promise<BwrapResult> {
  return new Promise((resolve, reject) => {
    const baseArgs = buildBwrapArgs(config, opts.cwd);
    const args = [...baseArgs, ...opts.command];

    const child = spawn("bwrap", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      env: { ...process.env },
    });

    // Pipe stdin
    if (opts.stdin !== undefined) {
      child.stdin!.write(opts.stdin);
      child.stdin!.end();
    } else {
      child.stdin!.end();
    }

    let stdout = "";
    let stderr = "";

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    if (opts.timeout && opts.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killGroup(child);
      }, opts.timeout * 1000);
    }

    // Abort signal
    const onAbort = () => killGroup(child);
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);

      if (opts.signal?.aborted) {
        resolve({ stdout, stderr, exitCode: code, timedOut: false, aborted: true });
      } else if (timedOut) {
        resolve({ stdout, stderr, exitCode: code, timedOut: true, aborted: false });
      } else {
        resolve({ stdout, stderr, exitCode: code, timedOut: false, aborted: false });
      }
    });
  });
}

/**
 * Mata um child process e todo seu grupo de processos.
 */
export function killGroup(child: ChildProcess): void {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

/**
 * Limpa recursos do sandbox.
 * Chamado em session_shutdown.
 */
export function cleanup(): void {
  cleanupSeccomp();
}
