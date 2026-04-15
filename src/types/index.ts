/**
 * x402 Facilitator Types
 */

// Supported networks
export type Network =
  | 'base'
  | 'base-sepolia'
  | 'solana'
  | 'solana-devnet'
  | 'skale'
  | 'skale-base'
  | 'skale-base-sepolia'
  | 'eip155:8453'        // Base mainnet CAIP-2
  | 'eip155:84532'       // Base Sepolia CAIP-2
  | 'eip155:1187947933'  // SKALE Base mainnet CAIP-2
  | 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'  // Solana mainnet CAIP-2
  | 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'; // Solana devnet CAIP-2

// EVM Authorization (EIP-3009)
export interface EvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// EVM Payment Payload (EIP-3009)
export interface EvmPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    authorization: EvmAuthorization;
  };
}

// Exact Permit2 Witness (no facilitator field, unlike upto)
export interface ExactPermit2Witness {
  to: string;
  validAfter: string;
}

// Exact Permit2 Authorization
export interface ExactPermit2Authorization {
  from: string;
  permitted: {
    token: string;
    amount: string;
  };
  spender: string;
  nonce: string;
  deadline: string;
  witness: ExactPermit2Witness;
}

// EVM Payment Payload (Permit2 exact)
export interface EvmPermit2PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    permit2Authorization: ExactPermit2Authorization;
  };
}

// ============================================================================
// Upto Scheme Types (Permit2-based)
// ============================================================================

// Upto Permit2 Witness (includes facilitator field)
export interface UptoPermit2Witness {
  to: string;
  facilitator: string;
  validAfter: string;
}

// Upto Permit2 Authorization
export interface UptoPermit2Authorization {
  from: string;
  permitted: {
    token: string;
    amount: string;
  };
  spender: string;
  nonce: string;
  deadline: string;
  witness: UptoPermit2Witness;
}

// Upto Payment Requirements (CDP v2 format)
export interface UptoPaymentRequirements {
  scheme: 'upto';
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown> & {
    facilitatorAddress?: string;
  };
}

// Upto Payment Payload (CDP v2 format — uses `accepted` instead of top-level scheme/network)
export interface UptoPaymentPayload {
  x402Version: number;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted: UptoPaymentRequirements;
  payload: {
    signature: string;
    permit2Authorization: UptoPermit2Authorization;
  };
  extensions?: Record<string, unknown>;
}

// Upto Verify Request (CDP v2 format)
export interface UptoVerifyRequest {
  x402Version: number;
  paymentPayload: UptoPaymentPayload;
  paymentRequirements: UptoPaymentRequirements;
}

// Upto Settle Request (CDP v2 format, adds settlementAmount)
export interface UptoSettleRequest {
  x402Version: number;
  paymentPayload: UptoPaymentPayload;
  paymentRequirements: UptoPaymentRequirements;
  settlementAmount: string;
}

// Solana Payment Payload
export interface SolanaPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    transaction: string; // Base64 encoded serialized transaction
  };
}

export type PaymentPayload = EvmPaymentPayload | SolanaPaymentPayload;

// Payment Requirements
export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired?: string;
  amount?: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

// Verify Request
export interface VerifyRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

// Verify Response
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
}

// Settle Request
export interface SettleRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

// Settle Response
export interface SettleResponse {
  success: boolean;
  transaction: string;
  network: string;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
}

// Supported Response
export interface SupportedKind {
  x402Version: number;
  scheme: 'exact' | 'upto';
  network: string;
  extra?: Record<string, unknown>;
}

export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}

// Error reasons
export type ErrorReason =
  | 'invalid_signature'
  | 'invalid_payload'
  | 'invalid_network'
  | 'invalid_scheme'
  | 'invalid_x402_version'
  | 'payment_expired'
  | 'insufficient_funds'
  | 'recipient_mismatch'
  | 'amount_mismatch'
  | 'settlement_failed'
  | 'unsupported_network'
  | 'unexpected_error';

// ============================================================================
// Bazaar Discovery Types (x402 v2 Extension)
// ============================================================================

// Bazaar extension in PaymentRequirements
export interface BazaarExtension {
  info: {
    input?: {
      type: 'http';
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      queryParams?: Record<string, unknown>;
      body?: Record<string, unknown>;
    };
    output?: {
      type: 'json' | 'text' | 'binary';
      example?: Record<string, unknown>;
    };
  };
  schema?: Record<string, unknown>;
}

// Extended PaymentRequirements with Bazaar extension
export interface PaymentRequirementsWithExtensions extends PaymentRequirements {
  extensions?: {
    bazaar?: BazaarExtension;
    [key: string]: unknown;
  };
}

// Discovered resource stored in registry
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

// Discovery list response
export interface DiscoveryListResponse {
  x402Version: 2;
  items: DiscoveredResource[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Discovery query parameters
export interface DiscoveryQueryParams {
  type?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// OASF (Open Agent Service Framework) Types
// ============================================================================

// OASF Skill definition
export interface OASFSkill {
  name: string;  // Hierarchical identifier (e.g., "blockchain/payment_verification")
  id: number;    // Unique skill class identifier
}

// OASF Domain definition
export interface OASFDomain {
  name: string;  // Hierarchical identifier (e.g., "technology/blockchain")
  id: number;    // Unique domain class identifier
}

// OASF Locator (resource reference)
export interface OASFLocator {
  type: 'service' | 'source_code' | 'docker' | 'documentation';
  url: string;
}

// OASF Module (extensible operational parameters)
export interface OASFModule {
  type: string;
  [key: string]: unknown;
}

// OASF Agent Record (main structure)
export interface OASFAgentRecord {
  name: string;
  description: string;
  version: string;
  schema_version: string;
  authors: string[];
  created_at: string;  // RFC 3339 format
  domains: OASFDomain[];
  skills: OASFSkill[];
  modules: OASFModule[];
  locators: OASFLocator[];
}
