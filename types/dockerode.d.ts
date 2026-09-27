// dockerode 没自带 types，也没装 @types/dockerode
// 这里只声明 worker 里实际用到的方法，最小子集
declare module "dockerode" {
  export interface ContainerCreateOptions {
    Image: string;
    Cmd?: string[];
    Env?: string[];
    User?: string;
    HostConfig?: {
      NetworkMode?: string;
      Memory?: number;
      MemorySwap?: number;
      Cpus?: number;
      PidsLimit?: number;
      ReadonlyRootfs?: boolean;
      Tmpfs?: Record<string, string>;
      CapDrop?: string[];
      SecurityOpt?: string[];
      Binds?: string[];
      AutoRemove?: boolean;
    };
  }

  export interface Container {
    start(): Promise<void>;
    wait(): Promise<{ StatusCode: number }>;
    kill(opts?: { signal?: string }): Promise<void>;
    remove(opts?: { force?: boolean; v?: boolean }): Promise<void>;
    exec(opts: {
      Cmd: string[];
      AttachStdin?: boolean;
      AttachStdout?: boolean;
      AttachStderr?: boolean;
    }): Promise<Exec>;
    logs(opts?: {
      stdout?: boolean;
      stderr?: boolean;
      follow?: boolean;
    }): Promise<NodeJS.ReadableStream>;
    inspect(): Promise<ContainerInspectInfo>;
  }

  export interface ContainerInspectInfo {
    State?: { Running?: boolean; ExitCode?: number; OOMKilled?: boolean };
  }

  export interface Exec {
    start(opts: {
      hijack?: boolean;
      stdin?: boolean;
      stdout?: boolean;
      stderr?: boolean;
      Detach?: boolean;
    }): Promise<{ output?: NodeJS.ReadableStream; input?: NodeJS.WritableStream }>;
    inspect(): Promise<ExecInspectInfo>;
  }

  export interface ExecInspectInfo {
    Running?: boolean;
    ExitCode?: number | null;
    ProcessConfig?: { Args?: string[] };
  }

  export default class Docker {
    constructor(opts?: {
      socketPath?: string;
      host?: string;
      port?: number;
      protocol?: string;
    });
    createContainer(opts: ContainerCreateOptions): Promise<Container>;
    pull(
      repo: string,
      opts: object,
      cb?: (err: Error | null, stream: NodeJS.ReadableStream) => void,
    ): Promise<NodeJS.ReadableStream>;
    ping(): Promise<"OK">;
  }
}
