/**
 * AutoIncentive Facilitator SDK - Data Models
 *
 * Type definitions for x402 payment verification and settlement.
 */
package online.autoincentive.facilitator

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================================
// Payment Types
// ============================================================================

/**
 * EVM Authorization (EIP-3009)
 */
@Serializable
data class EvmAuthorization(
    val from: String,
    val to: String,
    val value: String,
    val validAfter: String,
    val validBefore: String,
    val nonce: String
)

/**
 * EVM Payment Payload
 */
@Serializable
data class EvmPaymentPayload(
    val x402Version: Int,
    val scheme: String = "exact",
    val network: String,
    val payload: EvmPayloadData
)

@Serializable
data class EvmPayloadData(
    val signature: String,
    val authorization: EvmAuthorization
)

/**
 * Solana Payment Payload
 */
@Serializable
data class SolanaPaymentPayload(
    val x402Version: Int,
    val scheme: String = "exact",
    val network: String,
    val payload: SolanaPayloadData
)

@Serializable
data class SolanaPayloadData(
    val transaction: String  // Base64 encoded serialized transaction
)

/**
 * Generic Payment Payload wrapper for JSON serialization
 */
@Serializable
data class PaymentPayload(
    val x402Version: Int,
    val scheme: String = "exact",
    val network: String,
    val payload: Map<String, kotlinx.serialization.json.JsonElement>
)

/**
 * Payment Requirements
 */
@Serializable
data class PaymentRequirements(
    val scheme: String = "exact",
    val network: String,
    val maxAmountRequired: String,
    val resource: String,
    val description: String,
    val mimeType: String,
    val payTo: String,
    val maxTimeoutSeconds: Int,
    val asset: String,
    val extra: Map<String, kotlinx.serialization.json.JsonElement>? = null
)

// ============================================================================
// Request Types
// ============================================================================

@Serializable
data class VerifyRequest(
    val x402Version: Int,
    val paymentPayload: PaymentPayload,
    val paymentRequirements: PaymentRequirements
)

@Serializable
data class SettleRequest(
    val x402Version: Int,
    val paymentPayload: PaymentPayload,
    val paymentRequirements: PaymentRequirements
)

// ============================================================================
// Response Types
// ============================================================================

/**
 * Health check response
 */
@Serializable
data class HealthResponse(
    val status: String,
    val timestamp: String
)

/**
 * Verify response
 */
@Serializable
data class VerifyResponse(
    val isValid: Boolean,
    val invalidReason: String? = null,
    val payer: String? = null
)

/**
 * Settle response
 */
@Serializable
data class SettleResponse(
    val success: Boolean,
    val transaction: String? = null,
    val network: String? = null,
    val errorReason: String? = null,
    val payer: String? = null
)

/**
 * Supported network kind
 */
@Serializable
data class SupportedKind(
    val x402Version: Int,
    val scheme: String,
    val network: String,
    val extra: Map<String, kotlinx.serialization.json.JsonElement>? = null
)

/**
 * Supported networks response
 */
@Serializable
data class SupportedResponse(
    val kinds: List<SupportedKind>,
    val signers: Map<String, List<String>>
)

// ============================================================================
// Discovery Types
// ============================================================================

/**
 * Payment acceptance option
 */
@Serializable
data class AcceptedPayment(
    val scheme: String,
    val network: String,
    val amount: String,
    val asset: String,
    val payTo: String
)

/**
 * Resource metadata
 */
@Serializable
data class ResourceMetadata(
    val description: String? = null,
    val input: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    val inputSchema: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    val output: Map<String, kotlinx.serialization.json.JsonElement>? = null,
    val outputSchema: Map<String, kotlinx.serialization.json.JsonElement>? = null
)

/**
 * Discovered resource
 */
@Serializable
data class DiscoveredResource(
    val resource: String,
    val type: String = "http",
    val x402Version: Int,
    val accepts: List<AcceptedPayment>,
    val lastUpdated: String,
    val metadata: ResourceMetadata? = null
)

/**
 * Pagination info
 */
@Serializable
data class Pagination(
    val limit: Int,
    val offset: Int,
    val total: Int
)

/**
 * Discovery list response
 */
@Serializable
data class DiscoveryListResponse(
    val x402Version: Int,
    val items: List<DiscoveredResource>,
    val pagination: Pagination
)

/**
 * Discovery stats response
 */
@Serializable
data class DiscoveryStats(
    val totalResources: Int,
    val networks: Map<String, Int>,
    val lastUpdated: String
)

// ============================================================================
// OASF Types
// ============================================================================

/**
 * OASF Skill
 */
@Serializable
data class OASFSkill(
    val name: String,
    val id: Int
)

/**
 * OASF Domain
 */
@Serializable
data class OASFDomain(
    val name: String,
    val id: Int
)

/**
 * OASF Locator
 */
@Serializable
data class OASFLocator(
    val type: String,
    val url: String
)

/**
 * OASF Agent Record
 */
@Serializable
data class OASFAgentRecord(
    val name: String,
    val description: String,
    val version: String,
    @SerialName("schema_version") val schemaVersion: String,
    val authors: List<String>,
    @SerialName("created_at") val createdAt: String,
    val domains: List<OASFDomain>,
    val skills: List<OASFSkill>,
    val modules: List<Map<String, kotlinx.serialization.json.JsonElement>>,
    val locators: List<OASFLocator>
)

/**
 * OASF Skills response
 */
@Serializable
data class OASFSkillsResponse(
    val agent: String,
    val version: String,
    val skills: List<OASFSkill>
)

// ============================================================================
// Error Types
// ============================================================================

/**
 * Facilitator API error
 */
class FacilitatorException(
    message: String,
    val statusCode: Int,
    val details: String? = null
) : Exception(message)
