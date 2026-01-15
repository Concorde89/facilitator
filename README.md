# AutoIncentive Facilitator

Self-hosted x402 payment verification and settlement for Base and Solana networks.

**Public Endpoint:** https://facilitator.x402endpoints.online

**Full API Documentation:** [docs/API.md](docs/API.md)

## What it does

The facilitator handles two operations for x402 payments:

1. **Verify** - Validates payment signatures without moving funds
   - Checks EIP-712 signatures (Base) or transaction signatures (Solana)
   - Validates amounts, recipients, and timing
   - Checks payer has sufficient USDC balance

2. **Settle** - Actually transfers the funds on-chain
   - Submits the pre-signed authorization to the blockchain
   - Requires a funded wallet for gas fees
   - Returns transaction hash on success

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Configure (copy and edit .env)
cp .env.example .env

# Run
npm start
```

## Configuration

Create a `.env` file with:

```env
# Server
PORT=3402

# Base (EVM)
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=0x...  # For settlement (optional for verify-only)
BASE_CHAIN_ID=8453

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=...  # Base58 or JSON array format
```

**Important**: The private keys are only needed for settlement. Without them, the facilitator can still verify payments.

## API Endpoints

### GET /health
Health check endpoint.

```json
{ "status": "ok", "timestamp": "2024-01-15T..." }
```

### GET /supported
Lists supported networks and signer addresses.

```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "base" },
    { "x402Version": 2, "scheme": "exact", "network": "eip155:8453" },
    { "x402Version": 1, "scheme": "exact", "network": "solana" },
    { "x402Version": 2, "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }
  ],
  "signers": {
    "eip155:*": ["0x..."],
    "solana:*": ["..."]
  }
}
```

### POST /verify
Verifies a payment signature.

**Request:**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "base",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0x...",
        "to": "0x...",
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
    "payTo": "0x...",
    "description": "API access"
  }
}
```

**Response (success):**
```json
{ "isValid": true, "payer": "0x..." }
```

**Response (failure):**
```json
{ "isValid": false, "invalidReason": "insufficient_funds", "payer": "0x..." }
```

### POST /settle
Settles a payment (transfers funds on-chain).

Same request format as /verify.

**Response (success):**
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "base",
  "payer": "0x..."
}
```

**Response (failure):**
```json
{
  "success": false,
  "errorReason": "settlement_failed",
  "network": "base"
}
```

## Supported Networks

### Base (EVM)
- `base` / `eip155:8453` - Base Mainnet
- `base-sepolia` / `eip155:84532` - Base Sepolia Testnet

Uses USDC with EIP-3009 `transferWithAuthorization` for gasless transfers.

### Solana
- `solana` / `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` - Mainnet
- `solana-devnet` / `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` - Devnet

## Error Reasons

- `invalid_payload` - Malformed request or nonce already used
- `invalid_signature` - Signature verification failed
- `insufficient_funds` - Payer doesn't have enough USDC
- `amount_mismatch` - Signed amount doesn't match requirements
- `recipient_mismatch` - Signed recipient doesn't match payTo
- `payment_expired` - Outside validAfter/validBefore window
- `unsupported_network` - Network not supported
- `settlement_failed` - On-chain transaction failed
- `unexpected_error` - Internal error

## Deploying

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### PM2

```bash
pm2 start dist/index.js --name autoincentive-facilitator
```

### Systemd

```ini
[Unit]
Description=AutoIncentive Facilitator
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/autoincentive-facilitator
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Gas Requirements

For settlement, your facilitator wallet needs very small amounts:

- **Base**: ~0.00001-0.00005 ETH per settlement (~$0.003-0.02 USD)
- **Solana**: ~0.000005 SOL per settlement (~$0.001 USD)

Base uses L2 gas prices which are extremely cheap. A single $1 of ETH can settle thousands of payments.

The facilitator wallets only pay gas - they never hold user funds.

## Signer Addresses

| Network | Address | SNS |
|---------|---------|-----|
| Base | `0xDCab6a5ddEB65De28BEDD218F9be1DBf5011D02C` | x402facilitator.base.eth |
| Solana | `9JRPU5K4haWWo1g3WSjCaq283uYcbxvfdEATkaSLw9X8` | x402facilitator.sol |

## Security Notes

1. Keep private keys secure - use environment variables or secret managers
2. The facilitator can verify without private keys (verification is free)
3. Settlement requires funded wallets but never holds user funds
4. All transfers are directly from payer to payTo address

## License

MIT
