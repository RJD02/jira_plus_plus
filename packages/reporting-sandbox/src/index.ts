export interface SandboxExecutionRequest {
  moduleId: string;
  entryFn?: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SandboxExecutionResponse {
  output: unknown;
  logs: string[];
}

export interface SandboxRunner {
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResponse>;
}

export class NoopSandboxRunner implements SandboxRunner {
  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResponse> {
    return {
      output: {
        message: "Sandbox execution placeholder",
        moduleId: request.moduleId,
        input: request.input,
      },
      logs: [],
    };
  }
}
