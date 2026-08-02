export interface AuthConfig {
  username: string;
  password: string;
  auth_db: string;
}

export interface TlsConfig {
  enabled: boolean;
  ca_file: string | null;
  cert_key_file: string | null;
  allow_invalid_certs: boolean;
}

export interface SshConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string | null;
  key_file: string | null;
}

export type EnvironmentTier = "production" | "staging" | "development";

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  environment: EnvironmentTier;
  auth: AuthConfig | null;
  tls: TlsConfig | null;
  ssh: SshConfig | null;
}

export interface SelectedItem {
  connectionId: string;
  db: string;
  collection: string | null; // null = DBレベル（スクラッチパッドのみ）
}

// 接続失敗の原因（Rust側 connect_error::ConnectError と対応）
export interface ConnectError {
  stage: "config" | "ssh" | "tcp" | "mongo";
  category: string;
  detail: string;
}

export type ConnectStage = "ssh" | "tcp" | "mongo";
export type ConnectStageStatus = "start" | "ok" | "error";

export interface ConnectProgressEvent {
  token: string;
  stage: ConnectStage;
  status: ConnectStageStatus;
}

export function isConnectError(e: unknown): e is ConnectError {
  return typeof e === "object" && e !== null && "stage" in e && "category" in e && "detail" in e;
}

export function defaultConnection(): Omit<ConnectionConfig, "id"> {
  return {
    name: "",
    host: "localhost",
    port: 27017,
    environment: "development",
    auth: null,
    tls: null,
    ssh: null,
  };
}
