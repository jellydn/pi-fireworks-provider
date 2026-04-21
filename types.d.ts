// Type declarations for pi-coding-agent (available when running inside pi)
declare module "@mariozechner/pi-coding-agent" {
  export interface Model {
    id: string;
    name: string;
    reasoning: boolean;
    input: string[];
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
    contextWindow: number;
    maxTokens: number;
  }

  export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    api: string;
    models: Model[];
  }

  export interface ExtensionAPI {
    registerProvider(name: string, config: ProviderConfig): void;
  }
}
