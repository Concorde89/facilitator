/**
 * Bazaar Discovery Registry
 * Catalogs x402 resources for discovery by clients and AI agents
 */

import type {
  DiscoveredResource,
  DiscoveryListResponse,
  DiscoveryQueryParams,
  PaymentRequirementsWithExtensions,
  BazaarExtension,
} from '../types/index.js';

// In-memory registry (could be replaced with persistent storage)
const resourceRegistry = new Map<string, DiscoveredResource>();

/**
 * Extract discovery metadata from payment requirements
 */
export function extractDiscoveryInfo(
  x402Version: number,
  paymentRequirements: PaymentRequirementsWithExtensions
): DiscoveredResource | null {
  const bazaarExt = paymentRequirements.extensions?.bazaar as BazaarExtension | undefined;

  // Only catalog if bazaar extension is present (opt-in discovery)
  if (!bazaarExt) {
    return null;
  }

  const resource: DiscoveredResource = {
    resource: paymentRequirements.resource,
    type: 'http',
    x402Version,
    accepts: [
      {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network,
        amount: paymentRequirements.maxAmountRequired,
        asset: paymentRequirements.asset,
        payTo: paymentRequirements.payTo,
      },
    ],
    lastUpdated: new Date().toISOString(),
  };

  // Add metadata if available
  if (bazaarExt.info || paymentRequirements.description) {
    resource.metadata = {};

    if (paymentRequirements.description) {
      resource.metadata.description = paymentRequirements.description;
    }

    if (bazaarExt.info?.input) {
      resource.metadata.input = bazaarExt.info.input;
    }

    if (bazaarExt.info?.output?.example) {
      resource.metadata.output = bazaarExt.info.output.example;
    }

    if (bazaarExt.schema) {
      resource.metadata.outputSchema = bazaarExt.schema;
    }
  }

  return resource;
}

/**
 * Register or update a resource in the discovery catalog
 */
export function registerResource(resource: DiscoveredResource): void {
  const existing = resourceRegistry.get(resource.resource);

  if (existing) {
    // Merge payment methods if different
    const existingNetworks = new Set(
      existing.accepts.map((a) => `${a.network}:${a.asset}`)
    );

    for (const accept of resource.accepts) {
      const key = `${accept.network}:${accept.asset}`;
      if (!existingNetworks.has(key)) {
        existing.accepts.push(accept);
      }
    }

    existing.lastUpdated = resource.lastUpdated;
    existing.x402Version = Math.max(existing.x402Version, resource.x402Version);

    if (resource.metadata) {
      existing.metadata = { ...existing.metadata, ...resource.metadata };
    }
  } else {
    resourceRegistry.set(resource.resource, resource);
  }

  console.log(`[Bazaar] Registered resource: ${resource.resource}`);
}

/**
 * Catalog a resource from a payment (called during verify/settle)
 */
export function catalogFromPayment(
  x402Version: number,
  paymentRequirements: PaymentRequirementsWithExtensions
): void {
  const resource = extractDiscoveryInfo(x402Version, paymentRequirements);

  if (resource) {
    registerResource(resource);
  }
}

/**
 * List discovered resources with optional filtering and pagination
 */
export function listResources(params: DiscoveryQueryParams = {}): DiscoveryListResponse {
  const { type = 'http', limit = 20, offset = 0 } = params;

  // Get all resources as array
  let items = Array.from(resourceRegistry.values());

  // Filter by type
  if (type) {
    items = items.filter((r) => r.type === type);
  }

  // Sort by lastUpdated (newest first)
  items.sort((a, b) =>
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  const total = items.length;

  // Apply pagination
  items = items.slice(offset, offset + limit);

  return {
    x402Version: 2,
    items,
    pagination: {
      limit,
      offset,
      total,
    },
  };
}

/**
 * Get a specific resource by URL
 */
export function getResource(resourceUrl: string): DiscoveredResource | undefined {
  return resourceRegistry.get(resourceUrl);
}

/**
 * Remove a resource from the catalog
 */
export function removeResource(resourceUrl: string): boolean {
  return resourceRegistry.delete(resourceUrl);
}

/**
 * Get registry stats
 */
export function getStats(): { totalResources: number; networks: string[] } {
  const networks = new Set<string>();

  for (const resource of resourceRegistry.values()) {
    for (const accept of resource.accepts) {
      networks.add(accept.network);
    }
  }

  return {
    totalResources: resourceRegistry.size,
    networks: Array.from(networks),
  };
}

/**
 * Clear the registry (for testing)
 */
export function clearRegistry(): void {
  resourceRegistry.clear();
}
