/**
 * LsOperations — listagem de diretórios via bwrap.
 *
 * Implementa exists, stat e readdir usando comandos POSIX
 * executados dentro do namespace bwrap.
 */

import type { LsOperations } from "@earendil-works/pi-coding-agent";
import type { SandboxConfig } from "../types";
import { execInSandbox } from "../bwrap-executor";

/** Interface compatível com o que o tool ls espera de stat. */
interface StatResult {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}

export function createLsOps(config: SandboxConfig, cwd: string): LsOperations {
  return {
    async exists(filePath) {
      const { exitCode } = await execInSandbox(config, {
        command: ["test", "-e", filePath],
        cwd,
      });
      return exitCode === 0;
    },

    async stat(filePath): Promise<StatResult> {
      // stat --format retorna: tipo|tamanho|mtime_epoch
      const { stdout, exitCode } = await execInSandbox(config, {
        command: ["stat", "--format=%F|%s|%Y", filePath],
        cwd,
      });
      if (exitCode !== 0 || !stdout.trim()) {
        throw new Error(`Falha ao stat ${filePath}`);
      }

      const [type, sizeStr, mtimeStr] = stdout.trim().split("|");
      const size = parseInt(sizeStr || "0", 10);
      const mtimeMs = parseFloat(mtimeStr || "0") * 1000;

      return {
        isDirectory: () => type === "directory",
        isFile: () => type === "regular file" || type === "regular empty file",
        isSymbolicLink: () => type === "symbolic link",
        size,
        mtimeMs,
      };
    },

    async readdir(dirPath) {
      const { stdout, exitCode } = await execInSandbox(config, {
        command: ["ls", "-1a", dirPath],
        cwd,
      });
      if (exitCode !== 0) {
        throw new Error(`Falha ao listar ${dirPath}`);
      }
      return stdout.trim().split("\n").filter(
        (entry) => entry !== "." && entry !== "..",
      );
    },
  };
}
