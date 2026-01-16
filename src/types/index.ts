/**
 * x402 Facilitator Types
 */

// Supported networks
export type Network =
  | 'base'
  | 'base-sepolia'
  | 'solana'
  | 'solana-devnet'
  | 'eip155:8453'    // Base mainnet CAIP-2
  | 'eip155:84532'   // Base Sepolia CAIP-2
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
    transaction: string; // Base64 encoded serialized transaction
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
  payer?: string;
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
  transaction?: string;
  network?: string;
  errorReason?: string;
  payer?: string;
}

// Supported Response
export interface SupportedKind {
  x402Version: number;
  scheme: 'exact';
  network: string;
  extra?: Record<string, unknown>;
}

export interface SupportedResponse {
  kinds: SupportedKind[];
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
