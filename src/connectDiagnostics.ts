import type { Messages } from "./i18n";
import { ConnectError } from "./types";

const REASON_KEYS: Record<string, keyof Messages> = {
  config_not_found: "connectReasonConfigNotFound",
  ssh_unreachable: "connectReasonSshUnreachable",
  ssh_key_load: "connectReasonSshKeyLoad",
  ssh_auth_failed: "connectReasonSshAuthFailed",
  ssh_local_port: "connectReasonSshLocalPort",
  ssh_agent_unsupported: "connectReasonSshAgentUnsupported",
  ssh_timeout: "connectReasonSshTimeout",
  tcp_refused: "connectReasonTcpRefused",
  tcp_timeout: "connectReasonTcpTimeout",
  tcp_unreachable: "connectReasonTcpUnreachable",
  mongo_auth_failed: "connectReasonMongoAuthFailed",
  mongo_server_selection: "connectReasonMongoServerSelection",
  mongo_tls_config: "connectReasonMongoTlsConfig",
  mongo_dns_fail: "connectReasonMongoDnsFail",
  mongo_refused: "connectReasonMongoRefused",
  mongo_timeout: "connectReasonMongoTimeout",
  mongo_io_error: "connectReasonMongoIoError",
  mongo_unauthorized: "connectReasonMongoUnauthorized",
  mongo_command_error: "connectReasonMongoCommandError",
  mongo_invalid_config: "connectReasonMongoInvalidConfig",
  mongo_client_init: "connectReasonMongoClientInit",
};

export function connectErrorReasonKey(err: ConnectError): keyof Messages {
  return REASON_KEYS[`${err.stage}_${err.category}`] ?? "connectReasonUnknown";
}
