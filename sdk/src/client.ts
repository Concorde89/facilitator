/**
 * AutoIncentive Facilitator SDK Client
 */

import type {
  FacilitatorConfig,
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  HealthResponse,
  DiscoveryListResponse,
  DiscoveryStats,
  DiscoveredResource,
  OASFAgentRecord,
  OASFSkillsResponse,
} from './types.js';

export class AutoIncentiveFacilitator {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(config: FacilitatorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  /**
   * Make HTTP request to facilitator
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new FacilitatorError(
          `Request failed: ${response.status} ${response.statusText}`,
          response.status,
          error
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof FacilitatorError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FacilitatorError('Request timeout', 408);
      }
      throw new FacilitatorError(
        error instanceof Error ? error.message : 'Unknown error',
        0
      );
    }
  }

  // ============================================================================
  // Core x402 Methods
  // ============================================================================

  /**
   * Check facilitator health
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  /**
   * Get supported networks and signers
   */
  async supported(): Promise<SupportedResponse> {
    return this.request<SupportedResponse>('GET', '/supported');
  }

  /**
   * Verify a payment signature
   */
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.request<VerifyResponse>('POST', '/verify', {
      x402Version: paymentPayload.x402Version,
      paymentPayload,
      paymentRequirements,
    });
  }

  /**
   * Settle a payment (execute the transfer)
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.request<SettleResponse>('POST', '/settle', {
      x402Version: paymentPayload.x402Version,
      paymentPayload,
      paymentRequirements,
    });
  }

  // ============================================================================
  // Discovery / Bazaar Methods
  // ============================================================================

  /**
   * List discovered resources (Bazaar)
   */
  async listResources(options?: {
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<DiscoveryListResponse> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = query ? `/discovery/resources?${query}` : '/discovery/resources';
    return this.request<DiscoveryListResponse>('GET', path);
  }

  /**
   * Register a resource manually
   */
  async registerResource(resource: DiscoveredResource): Promise<{
    success: boolean;
    message: string;
    resource: DiscoveredResource;
  }> {
    return this.request('POST', '/discovery/register', resource);
  }

  /**
   * Get discovery stats
   */
  async getDiscoveryStats(): Promise<DiscoveryStats> {
    return this.request<DiscoveryStats>('GET', '/discovery/stats');
  }

  // ============================================================================
  // OASF Methods
  // ============================================================================

  /**
   * Get OASF agent record
   */
  async getOASFRecord(): Promise<OASFAgentRecord> {
    return this.request<OASFAgentRecord>('GET', '/oasf/record');
  }

  /**
   * Get OASF skills
   */
  async getOASFSkills(): Promise<OASFSkillsResponse> {
    return this.request<OASFSkillsResponse>('GET', '/oasf/skills');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if facilitator is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Check if a network is supported
   */
  async isNetworkSupported(network: string): Promise<boolean> {
    const supported = await this.supported();
    return supported.kinds.some((k) => k.network === network);
  }

  /**
   * Get signer address for a network
   */
  async getSignerForNetwork(network: string): Promise<string | null> {
    const supported = await this.supported();

    // Check EVM networks
    if (network.startsWith('eip155:') || network.includes('base')) {
      const signers = supported.signers['eip155:*'];
      return signers?.[0] || null;
    }

    // Check Solana networks
    if (network.includes('solana')) {
      const signers = supported.signers['solana:*'];
      return signers?.[0] || null;
    }

    return null;
  }
}

/**
 * Custom error class for facilitator errors
 */
export class FacilitatorError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'FacilitatorError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
