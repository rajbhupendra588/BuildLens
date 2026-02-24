export interface AppSettings {
  [key: string]: string | null;
}

export interface StatsResponse {
  total_files: number;
  total_chunks: number;
}

export interface TestConnectionRequest {
  provider: string;
  api_key?: string;
  base_url?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}
