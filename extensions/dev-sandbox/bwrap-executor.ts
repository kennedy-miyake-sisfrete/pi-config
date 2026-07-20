/**
 * Core do sandbox — constrói argumentos bwrap e spawna o processo.
 *
 * Responsável por:
 *   - Montar a linha de comando bwrap baseada na SandboxConfig
 *   - Gerenciar ciclo de vida (timeout, abort, kill de grupo)
 *   - Coletar stdout/stderr com backpressure
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SandboxConfig, BwrapCall, BwrapResult } from "./types";

// ─── Cache de argumentos bwrap ──────────────────────────────

const bwrapArgsCache = new Map<string, string[]>();

function getBwrapCacheKey(config: SandboxConfig, cwd: string): string {
  const parts = [
    cwd,
    String(config.internet.enabled),
    String(config.ssh.mountReadOnly),
    config.filesystem.cacheDirs.npm,
    config.filesystem.cacheDirs.pip,
    config.filesystem.denyPaths.join(","),
    config.filesystem.extraWritable.join(","),
    config.filesystem.extraReadonly.join(","),
  ];
  return parts.join("|");
}

// ─── Construção de argumentos bwrap ───────────────────────────

/**
 * Constrói o array de argumentos base do bwrap.
 * Estes argumentos são comuns a todas as tools.
 * Cache por config+cwd para evitar reconstrução a cada tool call.
 */
export function buildBwrapArgs(config: SandboxConfig, cwd: string): string[] {
  const key = getBwrapCacheKey(config, cwd);
  const cached = bwrapArgsCache.get(key);
  if (cached) return [...cached];

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

  // HOME isolado — cria diretório vazio no namespace
  args.push("--dir", home);
  args.push("--setenv", "HOME", home);
  args.push("--setenv", "USER", process.env.USER || "root");

  bwrapArgsCache.set(key, [...args]);
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


