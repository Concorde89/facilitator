# AutoIncentive Facilitator SDK

TypeScript/JavaScript SDK for interacting with the AutoIncentive Facilitator x402 payment verification and settlement service.

## Installation

```bash
npm install @autoincentive/facilitator-sdk
```

## Quick Start

```typescript
import { AutoIncentiveFacilitator } from '@autoincentive/facilitator-sdk';

const facilitator = new AutoIncentiveFacilitator({
  baseUrl: 'https://facilitator.x402endpoints.online'
});

// Check health
const health = await facilitator.health();
console.log(health.status); // 'ok'

// Get supported networks
const supported = await facilitator.supported();
console.log(supported.kinds); // List of supported payment kinds

// Check if healthy
const isHealthy = await facilitator.isHealthy();
```

## API Reference

### Constructor

```typescript
const facilitator = new AutoIncentiveFacilitator({
  baseUrl: string;       // Required: Facilitator URL
  timeout?: number;      // Optional: Request timeout in ms (default: 30000)
  headers?: Record<string, string>; // Optional: Custom headers
});
```

### Core x402 Methods

#### `health()`
Check facilitator health status.

```typescript
const health = await facilitator.health();
// { status: 'ok', timestamp: '2025-01-15T...' }
```

#### `supported()`
Get supported networks and signers.

```typescript
const supported = await facilitator.supported();
// {
//   kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }, ...],
//   signers: { 'eip155:*': ['0x...'], 'solana:*': ['...'] }
// }
```

#### `verify(paymentPayload, paymentRequirements)`
Verify a payment signature.

```typescript
const result = await facilitator.verify(paymentPayload, paymentRequirements);
// { isValid: true, payer: '0x...' }
// or { isValid: false, invalidReason: 'invalid_signature' }
```

#### `settle(paymentPayload, paymentRequirements)`
Settle a payment (execute the transfer).

```typescript
const result = await facilitator.settle(paymentPayload, paymentRequirements);
// { success: true, transaction: '0x...', network: 'eip155:8453', payer: '0x...' }
```

### Discovery / Bazaar Methods

#### `listResources(options?)`
List discovered x402-enabled resources.

```typescript
const resources = await facilitator.listResources({
  type: 'http',
  limit: 20,
  offset: 0
});
```

#### `registerResource(resource)`
Manually register a resource.

```typescript
await facilitator.registerResource({
  resource: 'https://api.example.com/endpoint',
  type: 'http',
  x402Version: 2,
  accepts: [{
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '100000',
    asset: 'USDC',
    payTo: '0x...'
  }],
  lastUpdated: new Date().toISOString()
});
```

#### `getDiscoveryStats()`
Get discovery registry statistics.

```typescript
const stats = await facilitator.getDiscoveryStats();
// { totalResources: 42, networks: { 'eip155:8453': 30, ... }, lastUpdated: '...' }
```

### OASF Methods

#### `getOASFRecord()`
Get the OASF agent record describing this facilitator.

```typescript
const record = await facilitator.getOASFRecord();
// { name: 'AutoIncentive Facilitator', description: '...', skills: [...], ... }
```

#### `getOASFSkills()`
Get the list of OASF skills.

```typescript
const skills = await facilitator.getOASFSkills();
// { agent: 'AutoIncentive Facilitator', version: '1.0.0', skills: [...] }
```

### Utility Methods

#### `isHealthy()`
Quick check if facilitator is healthy.

```typescript
const healthy = await facilitator.isHealthy(); // true or false
```

#### `isNetworkSupported(network)`
Check if a network is supported.

```typescript
const supported = await facilitator.isNetworkSupported('eip155:8453'); // true
```

#### `getSignerForNetwork(network)`
Get the signer address for a network.

```typescript
const signer = await facilitator.getSignerForNetwork('base');
// '0x...' or null
```

## Error Handling

The SDK throws `FacilitatorError` for all errors:

```typescript
import { FacilitatorError } from '@autoincentive/facilitator-sdk';

try {
  await facilitator.verify(payload, requirements);
} catch (error) {
  if (error instanceof FacilitatorError) {
    console.error(`Error ${error.statusCode}: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

## Types

All types are exported for TypeScript users:

```typescript
import type {
  FacilitatorConfig,
  PaymentPayload,
  EvmPaymentPayload,
  SolanaPaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  DiscoveredResource,
  OASFAgentRecord,
} from '@autoincentive/facilitator-sdk';
```

## Supported Networks

- **Base Mainnet**: `base` or `eip155:8453`
- **Base Sepolia**: `base-sepolia` or `eip155:84532`
- **Solana Mainnet**: `solana` or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- **Solana Devnet**: `solana-devnet` or `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`

## License

MIT
