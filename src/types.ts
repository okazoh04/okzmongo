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

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  auth: AuthConfig | null;
  tls: TlsConfig | null;
  ssh: SshConfig | null;
}

export interface SelectedItem {
  connectionId: string;
  db: string;
  collection: string;
}

export function defaultConnection(): Omit<ConnectionConfig, "id"> {
  return {
    name: "",
    host: "localhost",
    port: 27017,
    auth: null,
    tls: null,
    ssh: null,
  };
}
