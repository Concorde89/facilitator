# AutoIncentive Facilitator API Documentation

## Overview

The AutoIncentive Facilitator is a payment verification and settlement service for the x402 protocol. It supports Base (EVM) and Solana networks.

**Public Endpoint:** `https://facilitator.x402endpoints.online`

## Quick Start

Add to your `.env`:
```env
FACILITATOR_URL=https://facilitator.x402endpoints.online
```

## Endpoints

### GET /health

Health check endpoint.

**Request:**
```bash
curl https://facilitator.x402endpoints.online/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-15T21:23:10.821Z"
}
```

---

### GET /supported

Returns supported networks and signer addresses.

**Request:**
```bash
curl https://facilitator.x402endpoints.online/supported
```

**Response:**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "base" },
    { "x402Version": 1, "scheme": "exact", "network": "base-sepolia" },
    { "x402Version": 2, "scheme": "exact", "network": "eip155:8453" },
    { "x402Version": 2, "scheme": "exact", "network": "eip155:84532" },
    { "x402Version": 1, "scheme": "exact", "network": "solana" },
    { "x402Version": 1, "scheme": "exact", "network": "solana-devnet" },
    { "x402Version": 2, "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
    { "x402Version": 2, "scheme": "exact", "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" }
  ],
  "signers": {
    "eip155:*": ["0xDCab6a5ddEB65De28BEDD218F9be1DBf5011D02C"],
    "solana:*": ["9JRPU5K4haWWo1g3WSjCaq283uYcbxvfdEATkaSLw9X8"]
  }
}
```

**Network Identifiers:**

| Network | v1 Format | v2 Format (CAIP-2) |
|---------|-----------|-------------------|
| Base Mainnet | `base` | `eip155:8453` |
| Base Sepolia | `base-sepolia` | `eip155:84532` |
| Solana Mainnet | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet | `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

---

### POST /verify

Verifies a payment signature without moving funds. Use this to check if a payment is valid before settlement.

**Request:**
```bash
curl -X POST https://facilitator.x402endpoints.online/verify \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base",
      "payload": {
        "signature": "0x...",
        "authorization": {
          "from": "0xPayerAddress",
          "to": "0xRecipientAddress",
          "value": "10000",
          "validAfter": "0",
          "validBefore": "1736956800",
          "nonce": "0x..."
        }
      }
    },
    "paymentRequirements": {
      "scheme": "exact",
      "network": "base",
      "maxAmountRequired": "10000",
      "resource": "https://api.example.com/data",
      "payTo": "0xRecipientAddress",
      "description": "API access"
    }
  }'
```

**Success Response (200):**
```json
{
  "isValid": true,
  "payer": "0xPayerAddress"
}
```

**Error Response (400):**
```json
{
  "isValid": false,
  "invalidReason": "insufficient_funds",
  "payer": "0xPayerAddress"
}
```

**Validation Checks:**
1. Signature is valid (EIP-712 for Base, transaction signature for Solana)
2. Amount matches `maxAmountRequired`
3. Recipient matches `payTo`
4. Current time is within `validAfter` and `validBefore`
5. Payer has sufficient USDC balance
6. Nonce hasn't been used (Base only)

---

### POST /settle

Settles a payment by executing the on-chain transfer. This actually moves USDC from payer to recipient.

**Request:**
```bash
curl -X POST https://facilitator.x402endpoints.online/settle \
  -H "Content-Type: application/json" \
  -d '{
    "paymentPayload": { ... },
    "paymentRequirements": { ... }
  }'
```

Same request format as `/verify`.

**Success Response (200):**
```json
{
  "success": true,
  "transaction": "0xTransactionHash",
  "network": "base",
  "payer": "0xPayerAddress"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "errorReason": "settlement_failed",
  "network": "base",
  "payer": "0xPayerAddress"
}
```

**Note:** Settlement first runs verification. If verification fails, settlement will not proceed.

---

## Data Structures

### PaymentPayload (Base/EVM)

```typescript
interface EvmPaymentPayload {
  x402Version: number;      // 1 or 2
  scheme: "exact";
  network: string;          // "base" or "eip155:8453"
  payload: {
    signature: string;      // EIP-712 signature (hex)
    authorization: {
      from: string;         // Payer address
      to: string;           // Recipient address
      value: string;        // Amount in USDC smallest units (6 decimals)
      validAfter: string;   // Unix timestamp (seconds)
      validBefore: string;  // Unix timestamp (seconds)
      nonce: string;        // Random 32-byte hex
    };
  };
}
```

### PaymentPayload (Solana)

```typescript
interface SolanaPaymentPayload {
  x402Version: number;      // 1 or 2
  scheme: "exact";
  network: string;          // "solana" or "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
  payload: {
    transaction: string;    // Base64-encoded signed transaction
  };
}
```

### PaymentRequirements

```typescript
interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;  // Amount in smallest units
  resource: string;           // URL of the resource being paid for
  payTo: string;              // Recipient address
  description?: string;       // Human-readable description
  mimeType?: string;          // Response content type
  asset?: string;             // Token contract address
  maxTimeoutSeconds?: number; // Payment validity window
  extra?: Record<string, unknown>;
}
```

---

## Error Reasons

| Error | Description |
|-------|-------------|
| `invalid_payload` | Malformed request or nonce already used |
| `invalid_signature` | EIP-712 signature verification failed |
| `insufficient_funds` | Payer doesn't have enough USDC |
| `amount_mismatch` | Signed amount doesn't match requirements |
| `recipient_mismatch` | Signed recipient doesn't match payTo |
| `payment_expired` | Current time outside validAfter/validBefore |
| `unsupported_network` | Network not supported |
| `settlement_failed` | On-chain transaction failed |
| `unexpected_error` | Internal server error |

---

## Integration Example

### Server-Side (Express Middleware)

```typescript
async function verifyAndSettlePayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<boolean> {
  const facilitatorUrl = process.env.FACILITATOR_URL;

  // Decode payment header
  const paymentPayload = JSON.parse(
    Buffer.from(paymentHeader, 'base64').toString('utf8')
  );

  // Verify first
  const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
  });

  const verifyResult = await verifyRes.json();
  if (!verifyResult.isValid) {
    console.error('Verification failed:', verifyResult.invalidReason);
    return false;
  }

  // Then settle
  const settleRes = await fetch(`${facilitatorUrl}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
  });

  const settleResult = await settleRes.json();
  if (!settleResult.success) {
    console.error('Settlement failed:', settleResult.errorReason);
    return false;
  }

  console.log('Payment settled! TX:', settleResult.transaction);
  return true;
}
```

### Client-Side (Creating Payment)

```typescript
import { signTypedData } from 'viem/accounts';

// EIP-712 domain for USDC on Base
const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

// EIP-712 types
const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

// Create authorization
const authorization = {
  from: walletAddress,
  to: payToAddress,
  value: BigInt(amount),
  validAfter: BigInt(0),
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 900), // 15 min
  nonce: `0x${crypto.randomBytes(32).toString('hex')}`,
};

// Sign
const signature = await signTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message: authorization,
});

// Build payment payload
const paymentPayload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base',
  payload: {
    signature,
    authorization: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value.toString(),
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
    },
  },
};

// Encode for header
const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
```

---

## Signer Addresses

The facilitator uses these addresses to pay gas for settlements:

| Network | Address | SNS |
|---------|---------|-----|
| Base | `0xDCab6a5ddEB65De28BEDD218F9be1DBf5011D02C` | - |
| Solana | `9JRPU5K4haWWo1g3WSjCaq283uYcbxvfdEATkaSLw9X8` | x402facilitator.sol |

These wallets only pay gas fees. They never hold or touch user funds - transfers go directly from payer to recipient.

---

## USDC Contract Addresses

| Network | USDC Address |
|---------|-------------|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Solana Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Solana Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

---

## Rate Limits

Currently no rate limits are enforced. Please use responsibly.

---

## Support

- GitHub: [AutoIncentive](https://github.com/autoincentive)
- Twitter: [@AutoIncentive](https://twitter.com/autoincentive)
