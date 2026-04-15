/**
 * Base (EVM) Facilitator
 * Handles verification and settlement for Base mainnet/testnet
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyTypedData,
  getAddress,
  formatUnits,
  defineChain,
  type Address,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  EvmPaymentPayload,
  EvmPermit2PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '../types/index.js';

// SKALE Base mainnet chain definition
const skaleBase = defineChain({
  id: 1187947933,
  name: 'SKALE Base',
  nativeCurrency: {
    name: 'CREDIT',
    symbol: 'CREDIT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://skale-base.skalenodes.com/v1/base'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SKALE Explorer',
      url: 'https://skale-base-explorer.skalenodes.com',
    },
  },
});

// USDC addresses
const USDC_ADDRESSES: Record<number, Address> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',      // Base mainnet
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',    // Base Sepolia
  1187947933: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20', // SKALE Base mainnet
};

// USDC EIP-712 domain (per-chain, since bridged USDC may have different name/version)
const USDC_DOMAIN_OVERRIDES: Record<number, { name: string; version: string }> = {
  1187947933: { name: 'Bridged USDC (SKALE Bridge)', version: '2' }, // SKALE Base mainnet
};

const getUsdcDomain = (chainId: number) => {
  const override = USDC_DOMAIN_OVERRIDES[chainId];
  return {
    name: override?.name || 'USD Coin',
    version: override?.version || '2',
    chainId,
    verifyingContract: USDC_ADDRESSES[chainId],
  };
};

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

// ============================================================================
// Permit2 Exact Constants (from CDP x402 SDK)
// ============================================================================

const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const EXACT_PERMIT2_PROXY_ADDRESS: Address = '0x402085c248EeA27D92E8b30b2C58ed07f9E20001';

// EIP-712 types for Permit2 PermitWitnessTransferFrom (exact scheme)
// Witness(address to, uint256 validAfter)
const EXACT_PERMIT2_WITNESS_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'Witness' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  Witness: [
    { name: 'to', type: 'address' },
    { name: 'validAfter', type: 'uint256' },
  ],
} as const;

// x402ExactPermit2Proxy ABI (settle function only)
const EXACT_PERMIT2_PROXY_ABI = [
  {
    type: 'function',
    name: 'settle',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'owner', type: 'address' },
      {
        name: 'witness',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'validAfter', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// Parse network string to chain ID
function getChainId(network: string): number {
  if (network === 'base' || network === 'eip155:8453') return 8453;
  if (network === 'base-sepolia' || network === 'eip155:84532') return 84532;
  if (network === 'skale' || network === 'skale-base' || network === 'skale-base-sepolia' || network === 'eip155:1187947933') return 1187947933;
  throw new Error(`Unsupported network: ${network}`);
}

// Get chain config
function getChain(chainId: number) {
  if (chainId === 8453) return base;
  if (chainId === 84532) return baseSepolia;
  if (chainId === 1187947933) return skaleBase;
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

      // 1. Validate timing (30s buffer to ensure tx can be mined before expiry)
      const now = Math.floor(Date.now() / 1000);
      if (now < parseInt(validAfter)) {
        return {
          isValid: false,
          invalidReason: 'payment_not_yet_valid',
          payer: from,
        };
      }
      if (parseInt(validBefore) < now + 30) {
        return {
          isValid: false,
          invalidReason: 'payment_expired',
          payer: from,
        };
      }

      // 2. Validate amount (accept both field names for x402 SDK compatibility)
      const requiredAmount = requirements.maxAmountRequired || requirements.amount;
      if (value !== requiredAmount) {
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

      // 3b. Reject self-transfers (USDC transferWithAuthorization reverts when from == to)
      if (from.toLowerCase() === to.toLowerCase()) {
        return {
          isValid: false,
          invalidReason: 'self_transfer_not_allowed',
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
        transaction: '',
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
          transaction: '',
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
        transaction: '',
        errorReason: 'settlement_failed',
        network: paymentPayload.network,
      };
    }
  }

  /**
   * Verify a Permit2 exact payment signature
   */
  async verifyPermit2(
    paymentPayload: EvmPermit2PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      const chainId = getChainId(paymentPayload.network);
      const { signature, permit2Authorization } = paymentPayload.payload;
      const payer = permit2Authorization.from;

      // 1. Validate spender is the exact proxy contract
      if (getAddress(permit2Authorization.spender) !== getAddress(EXACT_PERMIT2_PROXY_ADDRESS)) {
        return { isValid: false, invalidReason: 'invalid_permit2_spender', payer };
      }

      // 2. Validate recipient
      if (getAddress(permit2Authorization.witness.to) !== getAddress(requirements.payTo)) {
        return { isValid: false, invalidReason: 'invalid_permit2_recipient_mismatch', payer };
      }

      // 3. Reject self-transfers
      if (getAddress(payer) === getAddress(permit2Authorization.witness.to)) {
        return { isValid: false, invalidReason: 'self_transfer_not_allowed', payer };
      }

      // 4. Validate timing (30s buffer)
      const now = Math.floor(Date.now() / 1000);
      if (BigInt(permit2Authorization.deadline) < BigInt(now + 30)) {
        return { isValid: false, invalidReason: 'permit2_deadline_expired', payer };
      }
      if (BigInt(permit2Authorization.witness.validAfter) > BigInt(now)) {
        return { isValid: false, invalidReason: 'permit2_not_yet_valid', payer };
      }

      // 5. Validate amount matches exactly
      const requiredAmount = requirements.maxAmountRequired || requirements.amount;
      if (BigInt(permit2Authorization.permitted.amount) !== BigInt(requiredAmount!)) {
        return { isValid: false, invalidReason: 'amount_mismatch', payer };
      }

      // 6. Validate token
      if (getAddress(permit2Authorization.permitted.token) !== getAddress(USDC_ADDRESSES[chainId])) {
        return { isValid: false, invalidReason: 'permit2_token_mismatch', payer };
      }

      // 7. Verify Permit2 EIP-712 signature
      const isValid = await verifyTypedData({
        address: payer as Address,
        domain: {
          name: 'Permit2',
          chainId,
          verifyingContract: PERMIT2_ADDRESS,
        },
        types: EXACT_PERMIT2_WITNESS_TYPES,
        primaryType: 'PermitWitnessTransferFrom',
        message: {
          permitted: {
            token: getAddress(permit2Authorization.permitted.token),
            amount: BigInt(permit2Authorization.permitted.amount),
          },
          spender: getAddress(permit2Authorization.spender),
          nonce: BigInt(permit2Authorization.nonce),
          deadline: BigInt(permit2Authorization.deadline),
          witness: {
            to: getAddress(permit2Authorization.witness.to),
            validAfter: BigInt(permit2Authorization.witness.validAfter),
          },
        },
        signature: signature as Hex,
      });

      if (!isValid) {
        return { isValid: false, invalidReason: 'invalid_permit2_signature', payer };
      }

      // 8. Check balance
      const client = createPublicClient({
        chain: getChain(chainId),
        transport: http(this.rpcUrl),
      });

      const balance = await client.readContract({
        address: USDC_ADDRESSES[chainId],
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [payer as Address],
      });

      if (balance < BigInt(permit2Authorization.permitted.amount)) {
        return { isValid: false, invalidReason: 'insufficient_funds', payer };
      }

      console.log(`✅ Permit2 exact verification passed for ${payer}`);
      console.log(`   Amount: ${formatUnits(BigInt(permit2Authorization.permitted.amount), 6)} USDC`);
      console.log(`   Balance: ${formatUnits(balance, 6)} USDC`);

      return { isValid: true, payer };
    } catch (error) {
      console.error('Permit2 exact verification error:', error);
      return { isValid: false, invalidReason: 'unexpected_error' };
    }
  }

  /**
   * Settle a Permit2 exact payment via x402ExactPermit2Proxy
   */
  async settlePermit2(
    paymentPayload: EvmPermit2PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    if (!this.privateKey) {
      return {
        success: false,
        transaction: '',
        errorReason: 'settlement_failed',
        network: paymentPayload.network,
      };
    }

    try {
      // First verify
      const verification = await this.verifyPermit2(paymentPayload, requirements);
      if (!verification.isValid) {
        return {
          success: false,
          transaction: '',
          errorReason: verification.invalidReason,
          payer: verification.payer,
          network: paymentPayload.network,
        };
      }

      const chainId = getChainId(paymentPayload.network);
      const chain = getChain(chainId);
      const { signature, permit2Authorization } = paymentPayload.payload;
      const payer = permit2Authorization.from;

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

      console.log(`💸 Settling Permit2 exact payment on Base...`);
      console.log(`   From: ${payer}`);
      console.log(`   To: ${permit2Authorization.witness.to}`);
      console.log(`   Amount: ${formatUnits(BigInt(permit2Authorization.permitted.amount), 6)} USDC`);

      // Call x402ExactPermit2Proxy.settle(permit, owner, witness, signature)
      const hash = await walletClient.writeContract({
        address: EXACT_PERMIT2_PROXY_ADDRESS,
        abi: EXACT_PERMIT2_PROXY_ABI,
        functionName: 'settle',
        args: [
          {
            permitted: {
              token: getAddress(permit2Authorization.permitted.token),
              amount: BigInt(permit2Authorization.permitted.amount),
            },
            nonce: BigInt(permit2Authorization.nonce),
            deadline: BigInt(permit2Authorization.deadline),
          },
          getAddress(payer),
          {
            to: getAddress(permit2Authorization.witness.to),
            validAfter: BigInt(permit2Authorization.witness.validAfter),
          },
          signature as Hex,
        ],
      });

      console.log(`   Tx Hash: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log(`✅ Permit2 exact settlement successful!`);
        return {
          success: true,
          transaction: hash,
          network: paymentPayload.network,
          payer,
        };
      } else {
        console.log(`❌ Permit2 exact settlement failed - transaction reverted`);
        return {
          success: false,
          errorReason: 'settlement_failed',
          transaction: hash,
          network: paymentPayload.network,
          payer,
        };
      }
    } catch (error) {
      console.error('Permit2 exact settlement error:', error);
      return {
        success: false,
        transaction: '',
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
    return ['base', 'base-sepolia', 'skale', 'skale-base', 'skale-base-sepolia', 'eip155:8453', 'eip155:84532', 'eip155:1187947933'];
  }
}
