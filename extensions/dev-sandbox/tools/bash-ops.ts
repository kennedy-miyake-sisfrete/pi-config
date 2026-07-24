/**
 * BashOperations para execução dentro do sandbox bwrap.
 *
 * Diferente das outras tools, bash precisa de callback onData
 * para streaming de stdout/stderr em tempo real.
 */

import { spawn } from "node:child_process";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import type { SandboxConfig } from "../types";
import { buildBwrapArgs, killGroup } from "../bwrap-executor";

export function createBashOps(config: SandboxConfig, cwd: string): BashOperations {
  return {
    async exec(command, cmdCwd, { onData, signal, timeout, env }) {
      const args = buildBwrapArgs(config, cwd);

      // Variáveis de ambiente customizadas
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === "string") {
            args.push("--setenv", key, value);
          }
        }
      }

      // Comando — usa bash -lc para carregar profile e ter job control
      args.push("bash", "-lc", command);

      return new Promise((resolve, reject) => {
        const child = spawn("bwrap", args, {
          cwd: cmdCwd,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          // Env mínimo para o binário bwrap — as vars do sandbox são
          // controladas por --clearenv + --setenv nos args acima
          env: { PATH: process.env.PATH || "" },
        });

        // Streaming de stdout
        child.stdout!.on("data", (chunk: Buffer) => {
          onData(chunk);
        });

        // Streaming de stderr
        child.stderr!.on("data", (chunk: Buffer) => {
          onData(chunk);
        });

        // Timeout
        let timedOut = false;
        let timer: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timer = setTimeout(() => {
            timedOut = true;
            killGroup(child);
          }, timeout * 1000);
        }

        // Abort signal
        const onAbort = () => killGroup(child);
        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("error", (err) => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        });

        child.on("close", (code) => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}
