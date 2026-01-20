/**
 * AutoIncentive Facilitator SDK Types
 */

// Payment Networks
export type Network =
  | 'base'
  | 'base-sepolia'
  | 'solana'
  | 'solana-devnet'
  | 'eip155:8453'
  | 'eip155:84532'
  | 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
  | 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

// EVM Authorization (EIP-3009)
export interface EvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// EVM Payment Payload
export interface EvmPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    authorization: EvmAuthorization;
  };
}

// Solana Payment Payload
export interface SolanaPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    transaction: string;
  };
}

export type PaymentPayload = EvmPaymentPayload | SolanaPaymentPayload;

// Payment Requirements
export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

// Verify Response
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

// Settle Response
export interface SettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  errorReason?: string;
  payer?: string;
}

// Supported Kind
export interface SupportedKind {
  x402Version: number;
  scheme: 'exact';
  network: string;
  extra?: Record<string, unknown>;
}

// Supported Response
export interface SupportedResponse {
  kinds: SupportedKind[];
  signers: Record<string, string[]>;
}

// Health Response
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

// Discovery Types
export interface DiscoveredResource {
  resource: string;
  type: 'http';
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
  }>;
  lastUpdated: string;
  metadata?: {
    description?: string;
    input?: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
    output?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
  };
}

export interface DiscoveryListResponse {
  x402Version: 2;
  items: DiscoveredResource[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface DiscoveryStats {
  totalResources: number;
  networks: Record<string, number>;
  lastUpdated: string;
}

// OASF Types
export interface OASFSkill {
  name: string;
  id: number;
}

export interface OASFDomain {
  name: string;
  id: number;
}

export interface OASFLocator {
  type: 'service' | 'source_code' | 'docker' | 'documentation';
  url: string;
}

export interface OASFModule {
  type: string;
  [key: string]: unknown;
}

export interface OASFAgentRecord {
  name: string;
  description: string;
  version: string;
  schema_version: string;
  authors: string[];
  created_at: string;
  domains: OASFDomain[];
  skills: OASFSkill[];
  modules: OASFModule[];
  locators: OASFLocator[];
}

export interface OASFSkillsResponse {
  agent: string;
  version: string;
  skills: OASFSkill[];
}

// SDK Configuration
export interface FacilitatorConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}
