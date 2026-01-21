/**
 * AutoIncentive Facilitator SDK - Client
 *
 * Kotlin client for x402 payment verification and settlement.
 */
package online.autoincentive.facilitator

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

/**
 * Configuration for the Facilitator client
 */
data class FacilitatorConfig(
    val baseUrl: String = DEFAULT_FACILITATOR_URL,
    val timeoutMs: Int = 30000,
    val headers: Map<String, String> = emptyMap()
) {
    companion object {
        const val DEFAULT_FACILITATOR_URL = "https://facilitator.x402endpoints.online"
    }
}

/**
 * AutoIncentive Facilitator client for x402 payment verification and settlement.
 *
 * Example usage:
 * ```kotlin
 * val client = FacilitatorClient()
 *
 * // Check health
 * val health = client.health()
 * println(health.status) // "ok"
 *
 * // Get supported networks
 * val supported = client.supported()
 * supported.kinds.forEach { println(it.network) }
 *
 * // Verify a payment
 * val result = client.verify(paymentPayload, requirements)
 * if (result.isValid) {
 *     // Payment is valid
 * }
 * ```
 */
class FacilitatorClient(
    private val config: FacilitatorConfig = FacilitatorConfig()
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val baseUrl = config.baseUrl.trimEnd('/')

    // ========================================================================
    // Core x402 Methods
    // ========================================================================

    /**
     * Check facilitator health status
     */
    suspend fun health(): HealthResponse {
        return get("/health")
    }

    /**
     * Get supported networks and signers
     */
    suspend fun supported(): SupportedResponse {
        return get("/supported")
    }

    /**
     * Verify a payment signature
     *
     * @param paymentPayload The payment payload containing signature/transaction
     * @param paymentRequirements The payment requirements to verify against
     * @return VerifyResponse with isValid status
     */
    suspend fun verify(
        paymentPayload: PaymentPayload,
        paymentRequirements: PaymentRequirements
    ): VerifyResponse {
        val request = VerifyRequest(
            x402Version = paymentPayload.x402Version,
            paymentPayload = paymentPayload,
            paymentRequirements = paymentRequirements
        )
        return post("/verify", request)
    }

    /**
     * Settle a payment (execute the transfer)
     *
     * @param paymentPayload The payment payload containing signature/transaction
     * @param paymentRequirements The payment requirements
     * @return SettleResponse with transaction hash on success
     */
    suspend fun settle(
        paymentPayload: PaymentPayload,
        paymentRequirements: PaymentRequirements
    ): SettleResponse {
        val request = SettleRequest(
            x402Version = paymentPayload.x402Version,
            paymentPayload = paymentPayload,
            paymentRequirements = paymentRequirements
        )
        return post("/settle", request)
    }

    // ========================================================================
    // Discovery / Bazaar Methods
    // ========================================================================

    /**
     * List discovered x402-enabled resources
     *
     * @param type Resource type filter (default: "http")
     * @param limit Maximum results to return
     * @param offset Pagination offset
     */
    suspend fun listResources(
        type: String? = null,
        limit: Int? = null,
        offset: Int? = null
    ): DiscoveryListResponse {
        val params = buildList {
            type?.let { add("type=$it") }
            limit?.let { add("limit=$it") }
            offset?.let { add("offset=$it") }
        }
        val query = if (params.isNotEmpty()) "?${params.joinToString("&")}" else ""
        return get("/discovery/resources$query")
    }

    /**
     * Register a resource manually
     */
    suspend fun registerResource(resource: DiscoveredResource): Map<String, Any> {
        return post("/discovery/register", resource)
    }

    /**
     * Get discovery registry statistics
     */
    suspend fun getDiscoveryStats(): DiscoveryStats {
        return get("/discovery/stats")
    }

    // ========================================================================
    // OASF Methods
    // ========================================================================

    /**
     * Get OASF agent record describing this facilitator
     */
    suspend fun getOASFRecord(): OASFAgentRecord {
        return get("/oasf/record")
    }

    /**
     * Get list of OASF skills
     */
    suspend fun getOASFSkills(): OASFSkillsResponse {
        return get("/oasf/skills")
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Quick check if facilitator is healthy
     */
    suspend fun isHealthy(): Boolean {
        return try {
            health().status == "ok"
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if a network is supported
     */
    suspend fun isNetworkSupported(network: String): Boolean {
        val supported = supported()
        return supported.kinds.any { it.network == network }
    }

    /**
     * Get signer address for a network
     */
    suspend fun getSignerForNetwork(network: String): String? {
        val supported = supported()

        // Check EVM networks
        if (network.startsWith("eip155:") || network.contains("base")) {
            return supported.signers["eip155:*"]?.firstOrNull()
        }

        // Check Solana networks
        if (network.contains("solana")) {
            return supported.signers["solana:*"]?.firstOrNull()
        }

        return null
    }

    // ========================================================================
    // HTTP Methods
    // ========================================================================

    private suspend inline fun <reified T> get(path: String): T = withContext(Dispatchers.IO) {
        request("GET", path, null)
    }

    private suspend inline fun <reified T, reified B> post(path: String, body: B): T = withContext(Dispatchers.IO) {
        request("POST", path, json.encodeToString(body))
    }

    private inline fun <reified T> request(method: String, path: String, body: String?): T {
        val url = URL("$baseUrl$path")
        val connection = url.openConnection() as HttpURLConnection

        try {
            connection.requestMethod = method
            connection.connectTimeout = config.timeoutMs
            connection.readTimeout = config.timeoutMs
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")

            // Add custom headers
            config.headers.forEach { (key, value) ->
                connection.setRequestProperty(key, value)
            }

            // Write body for POST requests
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { os ->
                    os.write(body.toByteArray(Charsets.UTF_8))
                }
            }

            val responseCode = connection.responseCode
            val responseBody = if (responseCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                throw FacilitatorException(
                    message = "Request failed: $responseCode ${connection.responseMessage}",
                    statusCode = responseCode,
                    details = errorBody
                )
            }

            return json.decodeFromString(responseBody)
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        /**
         * Default facilitator URL
         */
        const val DEFAULT_URL = "https://facilitator.x402endpoints.online"

        /**
         * Create a client with default configuration
         */
        fun create(baseUrl: String = DEFAULT_URL): FacilitatorClient {
            return FacilitatorClient(FacilitatorConfig(baseUrl = baseUrl))
        }
    }
}
