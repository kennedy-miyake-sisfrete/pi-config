/**
 * Tipos e interfaces para extensão dev-sandbox.
 */

export interface SandboxCacheDirs {
  /** Caminho absoluto para cache npm (ex: /proj/.sandbox-cache/npm). */
  npm: string;
  /** Caminho absoluto para cache pip (ex: /proj/.sandbox-cache/pip). */
  pip: string;
}

export interface SandboxFilesystemConfig {
  /** Paths extras montados read-write (além do $PWD que sempre é rw). */
  extraWritable: string[];
  /** Paths extras montados read-only (ex: /mnt/dados-compartilhados). */
  extraReadonly: string[];
  /** Paths explicitamente negados — sobrescreve /usr se necessário. */
  denyPaths: string[];
  /** Diretórios de cache com bind persistente entre comandos. */
  cacheDirs: SandboxCacheDirs;
}

export interface SandboxInternetConfig {
  /** true → --share-net (rede do host), false → --unshare-net (sem rede). */
  enabled: boolean;
}

export interface SandboxSshConfig {
  /** Monta ~/.ssh read-only no namespace. */
  mountReadOnly: boolean;
}

export interface SandboxConfig {
  /** Habilita/desabilita todo o sandbox. */
  enabled: boolean;
  /** Configuração de rede. */
  internet: SandboxInternetConfig;
  /** Configuração de filesystem. */
  filesystem: SandboxFilesystemConfig;
  /** Configuração de acesso SSH. */
  ssh: SandboxSshConfig;
}

/** Opções para uma chamada bwrap. */
export interface BwrapCall {
  /** Comando e argumentos (ex: ["bash", "-c", "npm test"]). */
  command: string[];
  /** Diretório de trabalho dentro do sandbox. */
  cwd: string;
  /** Conteúdo opcional para stdin. */
  stdin?: string;
  /** Sinal de aborto. */
  signal?: AbortSignal;
  /** Timeout em segundos. */
  timeout?: number;
}

/** Resultado de uma execução bwrap. */
export interface BwrapResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

/** Config padrão — valores de fábrica. */
export const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  internet: {
    enabled: true,
  },
  filesystem: {
    extraWritable: [],
    extraReadonly: [],
    denyPaths: ["/sbin", "/usr/sbin", "/root"],
    cacheDirs: {
      npm: "",
      pip: "",
    },
  },
  ssh: {
    mountReadOnly: true,
  },
};
