/**
 * Base (EVM) Facilitator
 * Handles verification and settlement for Base mainnet/testnet
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyTypedData,
  formatUnits,
  type Address,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  EvmPaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '../types/index.js';

// USDC addresses
const USDC_ADDRESSES: Record<number, Address> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base mainnet
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
};

// USDC EIP-712 domain
const getUsdcDomain = (chainId: number) => ({
  name: 'USD Coin',
  version: '2',
  chainId,
  verifyingContract: USDC_ADDRESSES[chainId],
});

// EIP-712 types for TransferWithAuthorization
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// USDC ABI (only what we need)
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Parse network string to chain ID
function getChainId(network: string): number {
  if (network === 'base' || network === 'eip155:8453') return 8453;
  if (network === 'base-sepolia' || network === 'eip155:84532') return 84532;
  throw new Error(`Unsupported network: ${network}`);
}

// Get chain config
function getChain(chainId: number) {
  if (chainId === 8453) return base;
  if (chainId === 84532) return baseSepolia;
  throw new Error(`Unsupported chain ID: ${chainId}`);
}

export class BaseFacilitator {
  private rpcUrl: string;
  private privateKey: Hex | null;
  private chainId: number;

  constructor(config: {
    rpcUrl: string;
    privateKey?: string;
    chainId?: number;
  }) {
    this.rpcUrl = config.rpcUrl;
    this.privateKey = config.privateKey ? (config.privateKey as Hex) : null;
    this.chainId = config.chainId || 8453;
  }

  /**
   * Verify a payment signature
   */
  async verify(
    paymentPayload: EvmPaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      const chainId = getChainId(paymentPayload.network);
      const { signature, authorization } = paymentPayload.payload;
      const { from, to, value, validAfter, validBefore, nonce } = authorization;

      // 1. Validate timing
      const now = Math.floor(Date.now() / 1000);
      if (now < parseInt(validAfter)) {
        return {
          isValid: false,
          invalidReason: 'payment_expired',
          payer: from,
        };
      }
      if (now > parseInt(validBefore)) {
        return {
          isValid: false,
          invalidReason: 'payment_expired',
          payer: from,
        };
      }

      // 2. Validate amount
      if (value !== requirements.maxAmountRequired) {
        return {
          isValid: false,
          invalidReason: 'amount_mismatch',
          payer: from,
        };
      }

      // 3. Validate recipient
      if (to.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return {
          isValid: false,
          invalidReason: 'recipient_mismatch',
          payer: from,
        };
      }

      // 4. Verify EIP-712 signature
      const isValid = await verifyTypedData({
        address: from as Address,
        domain: getUsdcDomain(chainId),
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: {
          from: from as Address,
          to: to as Address,
          value: BigInt(value),
          validAfter: BigInt(validAfter),
          validBefore: BigInt(validBefore),
          nonce: nonce as Hex,
        },
        signature: signature as Hex,
      });

      if (!isValid) {
        return {
          isValid: false,
          invalidReason: 'invalid_signature',
          payer: from,
        };
      }

      // 5. Check balance
      const client = createPublicClient({
        chain: getChain(chainId),
        transport: http(this.rpcUrl),
      });

      const balance = await client.readContract({
        address: USDC_ADDRESSES[chainId],
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [from as Address],
      });

      if (balance < BigInt(value)) {
        return {
          isValid: false,
          invalidReason: 'insufficient_funds',
          payer: from,
        };
      }

      // 6. Check if nonce already used
      const nonceUsed = await client.readContract({
        address: USDC_ADDRESSES[chainId],
        abi: USDC_ABI,
        functionName: 'authorizationState',
        args: [from as Address, nonce as Hex],
      });

      if (nonceUsed) {
        return {
          isValid: false,
          invalidReason: 'invalid_payload', // nonce already used
          payer: from,
        };
      }

      console.log(`✅ Base verification passed for ${from}`);
      console.log(`   Amount: ${formatUnits(BigInt(value), 6)} USDC`);
      console.log(`   Balance: ${formatUnits(balance, 6)} USDC`);

      return {
        isValid: true,
        payer: from,
      };
    } catch (error) {
      console.error('Base verification error:', error);
      return {
        isValid: false,
        invalidReason: 'unexpected_error',
      };
    }
  }

  /**
   * Settle a payment (actually transfer the funds)
   */
  async settle(
    paymentPayload: EvmPaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    if (!this.privateKey) {
      return {
        success: false,
        errorReason: 'settlement_failed',
        network: paymentPayload.network,
      };
    }

    try {
      // First verify
      const verification = await this.verify(paymentPayload, requirements);
      if (!verification.isValid) {
        return {
          success: false,
          errorReason: verification.invalidReason,
          payer: verification.payer,
          network: paymentPayload.network,
        };
      }

      const chainId = getChainId(paymentPayload.network);
      const chain = getChain(chainId);
      const { signature, authorization } = paymentPayload.payload;
      const { from, to, value, validAfter, validBefore, nonce } = authorization;

      // Create wallet client
      const account = privateKeyToAccount(this.privateKey);
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(this.rpcUrl),
      });

      console.log(`💸 Settling payment on Base...`);
      console.log(`   From: ${from}`);
      console.log(`   To: ${to}`);
      console.log(`   Amount: ${formatUnits(BigInt(value), 6)} USDC`);

      // Call transferWithAuthorization
      const hash = await walletClient.writeContract({
        address: USDC_ADDRESSES[chainId],
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        args: [
          from as Address,
          to as Address,
          BigInt(value),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce as Hex,
          signature as Hex,
        ],
      });

      console.log(`   Tx Hash: ${hash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log(`✅ Settlement successful!`);
        return {
          success: true,
          transaction: hash,
          network: paymentPayload.network,
          payer: from,
        };
      } else {
        console.log(`❌ Settlement failed - transaction reverted`);
        return {
          success: false,
          errorReason: 'settlement_failed',
          transaction: hash,
          network: paymentPayload.network,
          payer: from,
        };
      }
    } catch (error) {
      console.error('Base settlement error:', error);
      return {
        success: false,
        errorReason: 'settlement_failed',
        network: paymentPayload.network,
      };
    }
  }

  /**
   * Get facilitator wallet address
   */
  getSignerAddress(): string | null {
    if (!this.privateKey) return null;
    const account = privateKeyToAccount(this.privateKey);
    return account.address;
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return ['base', 'base-sepolia', 'eip155:8453', 'eip155:84532'];
  }
}
