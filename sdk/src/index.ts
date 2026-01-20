/**
 * AutoIncentive Facilitator SDK
 *
 * A TypeScript/JavaScript SDK for interacting with the AutoIncentive Facilitator
 * x402 payment verification and settlement service.
 *
 * @example
 * ```typescript
 * import { AutoIncentiveFacilitator } from '@autoincentive/facilitator-sdk';
 *
 * const facilitator = new AutoIncentiveFacilitator({
 *   baseUrl: 'https://facilitator.x402endpoints.online'
 * });
 *
 * // Check health
 * const health = await facilitator.health();
 *
 * // Verify a payment
 * const result = await facilitator.verify(paymentPayload, requirements);
 *
 * // Get OASF agent record
 * const agentRecord = await facilitator.getOASFRecord();
 * ```
 */

export { AutoIncentiveFacilitator, FacilitatorError } from './client.js';

export type {
  // Config
  FacilitatorConfig,

  // Networks
  Network,

  // Payment Types
  PaymentPayload,
  EvmPaymentPayload,
  SolanaPaymentPayload,
  EvmAuthorization,
  PaymentRequirements,

  // Response Types
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  SupportedKind,
  HealthResponse,

  // Discovery Types
  DiscoveredResource,
  DiscoveryListResponse,
  DiscoveryStats,

  // OASF Types
  OASFAgentRecord,
  OASFSkill,
  OASFDomain,
  OASFLocator,
  OASFModule,
  OASFSkillsResponse,
} from './types.js';

// Default facilitator URL
export const DEFAULT_FACILITATOR_URL = 'https://facilitator.x402endpoints.online';

/**
 * Create a facilitator client with default configuration
 */
export function createFacilitator(baseUrl = DEFAULT_FACILITATOR_URL) {
  const { AutoIncentiveFacilitator } = require('./client.js');
  return new AutoIncentiveFacilitator({ baseUrl });
}
