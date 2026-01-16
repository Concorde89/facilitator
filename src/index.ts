/**
 * AutoIncentive Facilitator
 * Self-hosted x402 payment verification and settlement for Base and Solana
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { BaseFacilitator } from './base/index.js';
import { SolanaFacilitator } from './solana/index.js';
import type {
  VerifyRequest,
  SettleRequest,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  EvmPaymentPayload,
  SolanaPaymentPayload,
  DiscoveryQueryParams,
  PaymentRequirementsWithExtensions,
} from './types/index.js';
import {
  catalogFromPayment,
  listResources,
  getStats,
} from './discovery/index.js';

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3402'),

  // Base
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  basePrivateKey: process.env.BASE_PRIVATE_KEY,
  baseChainId: parseInt(process.env.BASE_CHAIN_ID || '8453'),

  // Solana
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,

  // Rate limiting
  rateLimit: parseInt(process.env.RATE_LIMIT || '100'),
};

// Initialize facilitators
const baseFacilitator = new BaseFacilitator({
  rpcUrl: config.baseRpcUrl,
  privateKey: config.basePrivateKey,
  chainId: config.baseChainId,
});

const solanaFacilitator = new SolanaFacilitator({
  rpcUrl: config.solanaRpcUrl,
  privateKey: config.solanaPrivateKey,
});

// Helper to determine if payload is EVM or Solana
function isEvmNetwork(network: string): boolean {
  return network.includes('base') || network.startsWith('eip155:');
}

function isSolanaNetwork(network: string): boolean {
  return network.includes('solana');
}

// Create Express app
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /discovery/resources - Bazaar discovery endpoint
app.get('/discovery/resources', (req, res) => {
  const params: DiscoveryQueryParams = {
    type: (req.query.type as string) || 'http',
    limit: parseInt(req.query.limit as string) || 20,
    offset: parseInt(req.query.offset as string) || 0,
  };

  const response = listResources(params);
  res.json(response);
});

// GET /discovery/stats - Discovery registry stats
app.get('/discovery/stats', (_req, res) => {
  const stats = getStats();
  res.json(stats);
});

// GET /supported - List supported networks
app.get('/supported', (req, res) => {
  const baseAddress = baseFacilitator.getSignerAddress();
  const solanaAddress = solanaFacilitator.getSignerAddress();

  const response: SupportedResponse = {
    kinds: [
      // Base networks (v1 format)
      { x402Version: 1, scheme: 'exact', network: 'base' },
      { x402Version: 1, scheme: 'exact', network: 'base-sepolia' },
      // Base networks (v2 CAIP-2 format)
      { x402Version: 2, scheme: 'exact', network: 'eip155:8453' },
      { x402Version: 2, scheme: 'exact', network: 'eip155:84532' },
      // Solana networks (v1 format)
      { x402Version: 1, scheme: 'exact', network: 'solana' },
      { x402Version: 1, scheme: 'exact', network: 'solana-devnet' },
      // Solana networks (v2 CAIP-2 format)
      { x402Version: 2, scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
      { x402Version: 2, scheme: 'exact', network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' },
    ],
    signers: {
      'eip155:*': baseAddress ? [baseAddress] : [],
      'solana:*': solanaAddress ? [solanaAddress] : [],
    },
  };

  res.json(response);
});

// POST /verify - Verify a payment
app.post('/verify', async (req, res) => {
  try {
    const body = req.body as VerifyRequest;

    if (!body.paymentPayload || !body.paymentRequirements) {
      res.status(400).json({
        isValid: false,
        invalidReason: 'invalid_payload',
      } as VerifyResponse);
      return;
    }

    // Support both v1 (network at root) and v2 (network in accepted)
    const network = body.paymentPayload.network ||
                    (body.paymentPayload as any).accepted?.network ||
                    body.paymentRequirements?.network;

    // Validate network field exists
    if (!network || typeof network !== 'string') {
      console.error('Missing or invalid network in paymentPayload:', JSON.stringify(body.paymentPayload, null, 2));
      console.error('paymentRequirements:', JSON.stringify(body.paymentRequirements, null, 2));
      res.status(400).json({
        isValid: false,
        invalidReason: 'invalid_payload',
      } as VerifyResponse);
      return;
    }

    let response: VerifyResponse;

    if (isEvmNetwork(network)) {
      response = await baseFacilitator.verify(
        body.paymentPayload as EvmPaymentPayload,
        body.paymentRequirements
      );
    } else if (isSolanaNetwork(network)) {
      response = await solanaFacilitator.verify(
        body.paymentPayload as SolanaPaymentPayload,
        body.paymentRequirements
      );
    } else {
      response = {
        isValid: false,
        invalidReason: 'unsupported_network',
      };
    }

    // Catalog resource for Bazaar discovery (if valid and has bazaar extension)
    if (response.isValid) {
      catalogFromPayment(
        body.x402Version,
        body.paymentRequirements as PaymentRequirementsWithExtensions
      );
    }

    const status = response.isValid ? 200 : 400;
    res.status(status).json(response);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      isValid: false,
      invalidReason: 'unexpected_error',
    } as VerifyResponse);
  }
});

// POST /settle - Settle a payment
app.post('/settle', async (req, res) => {
  try {
    const body = req.body as SettleRequest;

    if (!body.paymentPayload || !body.paymentRequirements) {
      res.status(400).json({
        success: false,
        errorReason: 'invalid_payload',
      } as SettleResponse);
      return;
    }

    // Support both v1 (network at root) and v2 (network in accepted)
    const network = body.paymentPayload.network ||
                    (body.paymentPayload as any).accepted?.network ||
                    body.paymentRequirements?.network;

    // Validate network field exists
    if (!network || typeof network !== 'string') {
      console.error('Missing or invalid network in paymentPayload:', JSON.stringify(body.paymentPayload, null, 2));
      console.error('paymentRequirements:', JSON.stringify(body.paymentRequirements, null, 2));
      res.status(400).json({
        success: false,
        errorReason: 'invalid_payload',
      } as SettleResponse);
      return;
    }

    let response: SettleResponse;

    if (isEvmNetwork(network)) {
      if (!config.basePrivateKey) {
        res.status(503).json({
          success: false,
          errorReason: 'settlement_failed',
          network,
        } as SettleResponse);
        return;
      }

      response = await baseFacilitator.settle(
        body.paymentPayload as EvmPaymentPayload,
        body.paymentRequirements
      );
    } else if (isSolanaNetwork(network)) {
      response = await solanaFacilitator.settle(
        body.paymentPayload as SolanaPaymentPayload,
        body.paymentRequirements
      );
    } else {
      response = {
        success: false,
        errorReason: 'unsupported_network',
        network,
      };
    }

    const status = response.success ? 200 : 400;
    res.status(status).json(response);
  } catch (error) {
    console.error('Settle error:', error);
    res.status(500).json({
      success: false,
      errorReason: 'unexpected_error',
    } as SettleResponse);
  }
});

// Start server
app.listen(config.port, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           AutoIncentive Facilitator                            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Server:      http://localhost:${config.port}                          ║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                                    ║');
  console.log('║  - GET  /health              Health check                      ║');
  console.log('║  - GET  /supported           List supported networks           ║');
  console.log('║  - POST /verify              Verify a payment signature        ║');
  console.log('║  - POST /settle              Settle a payment                  ║');
  console.log('║  - GET  /discovery/resources Bazaar discovery (list APIs)      ║');
  console.log('║  - GET  /discovery/stats     Discovery stats                   ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Networks:                                                     ║');

  const baseAddress = baseFacilitator.getSignerAddress();
  const solanaAddress = solanaFacilitator.getSignerAddress();

  if (baseAddress) {
    console.log(`║  - Base:    ${baseAddress.slice(0, 10)}...${baseAddress.slice(-8)}  ✅ Ready    ║`);
  } else {
    console.log('║  - Base:    Not configured (verify only)              ║');
  }

  if (solanaAddress) {
    console.log(`║  - Solana:  ${solanaAddress.slice(0, 10)}...${solanaAddress.slice(-8)}  ✅ Ready    ║`);
  } else {
    console.log('║  - Solana:  Not configured (verify only)              ║');
  }

  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
});

export { BaseFacilitator, SolanaFacilitator };
