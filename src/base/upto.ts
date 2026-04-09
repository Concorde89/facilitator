/**
 * Upto (Permit2) Facilitator for Base
 * Handles verification and settlement for the x402 "upto" scheme.
 *
 * Uses Permit2 + x402UptoPermit2Proxy instead of EIP-3009.
 * Only the authorized facilitator can settle, and can settle any amount
 * up to the signed maximum.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyTypedData,
  getAddress,
  formatUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  UptoPaymentPayload,
  UptoPaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '../types/index.js';

// ============================================================================
// Constants (from official CDP x402 SDK)
// ============================================================================

const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const UPTO_PROXY_ADDRESS: Address = '0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002';

// Base mainnet USDC
const USDC_ADDRESS: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// EIP-712 types for Permit2 PermitWitnessTransferFrom (upto scheme)
// Must match: Witness(address to, address facilitator, uint256 validAfter)
const UPTO_PERMIT2_WITNESS_TYPES = {
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
    { name: 'facilitator', type: 'address' },
    { name: 'validAfter', type: 'uint256' },
  ],
} as const;

// x402UptoPermit2Proxy ABI (settle function only)
const UPTO_PROXY_ABI = [
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
      { name: 'amount', type: 'uint256' },
      { name: 'owner', type: 'address' },
      {
        name: 'witness',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'facilitator', type: 'address' },
          { name: 'validAfter', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// USDC balanceOf ABI
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ============================================================================
// UptoFacilitator Class
// ============================================================================

export class UptoFacilitator {
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
   * Verify an upto payment signature (Permit2-based)
   */
  async verify(
    paymentPayload: UptoPaymentPayload,
    requirements: UptoPaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      const { signature, permit2Authorization } = paymentPayload.payload;
      const payer = permit2Authorization.from;

      // 1. Validate scheme
      if (paymentPayload.accepted.scheme !== 'upto' || requirements.scheme !== 'upto') {
        return { isValid: false, invalidReason: 'invalid_upto_evm_scheme', payer };
      }

      // 1b. Validate network matches
      if (paymentPayload.accepted.network !== requirements.network) {
        return { isValid: false, invalidReason: 'invalid_upto_evm_network_mismatch', payer };
      }

      // 2. Validate spender is the upto proxy contract
      if (getAddress(permit2Authorization.spender) !== getAddress(UPTO_PROXY_ADDRESS)) {
        return { isValid: false, invalidReason: 'invalid_permit2_spender', payer };
      }

      // 3. Validate recipient
      if (getAddress(permit2Authorization.witness.to) !== getAddress(requirements.payTo)) {
        return { isValid: false, invalidReason: 'invalid_permit2_recipient_mismatch', payer };
      }

      // 4. Validate facilitator matches our signer
      const facilitatorAddress = this.getSignerAddress();
      if (!facilitatorAddress) {
        return { isValid: false, invalidReason: 'facilitator_not_configured', payer };
      }
      if (getAddress(permit2Authorization.witness.facilitator) !== getAddress(facilitatorAddress)) {
        return { isValid: false, invalidReason: 'upto_facilitator_mismatch', payer };
      }

      // 5. Validate timing
      const now = Math.floor(Date.now() / 1000);
      if (BigInt(permit2Authorization.deadline) < BigInt(now + 6)) {
        return { isValid: false, invalidReason: 'permit2_deadline_expired', payer };
      }
      if (BigInt(permit2Authorization.witness.validAfter) > BigInt(now)) {
        return { isValid: false, invalidReason: 'permit2_not_yet_valid', payer };
      }

      // 6. Validate authorized amount matches requirements
      if (BigInt(permit2Authorization.permitted.amount) !== BigInt(requirements.amount)) {
        return { isValid: false, invalidReason: 'amount_mismatch', payer };
      }

      // 7. Validate token
      if (getAddress(permit2Authorization.permitted.token) !== getAddress(requirements.asset)) {
        return { isValid: false, invalidReason: 'permit2_token_mismatch', payer };
      }

      // 8. Verify Permit2 EIP-712 signature
      const isValid = await verifyTypedData({
        address: payer as Address,
        domain: {
          name: 'Permit2',
          chainId: this.chainId,
          verifyingContract: PERMIT2_ADDRESS,
        },
        types: UPTO_PERMIT2_WITNESS_TYPES,
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
            facilitator: getAddress(permit2Authorization.witness.facilitator),
            validAfter: BigInt(permit2Authorization.witness.validAfter),
          },
        },
        signature: signature as Hex,
      });

      if (!isValid) {
        return { isValid: false, invalidReason: 'invalid_permit2_signature', payer };
      }

      // 9. Check USDC balance
      const client = createPublicClient({
        chain: base,
        transport: http(this.rpcUrl),
      });

      const balance = await client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [payer as Address],
      });

      if (balance < BigInt(permit2Authorization.permitted.amount)) {
        return { isValid: false, invalidReason: 'insufficient_funds', payer };
      }

      console.log(`✅ Upto verification passed for ${payer}`);
      console.log(`   Max authorized: ${formatUnits(BigInt(permit2Authorization.permitted.amount), 6)} USDC`);
      console.log(`   Balance: ${formatUnits(balance, 6)} USDC`);

      return { isValid: true, payer };
    } catch (error) {
      console.error('Upto verification error:', error);
      return { isValid: false, invalidReason: 'unexpected_error' };
    }
  }

  /**
   * Settle an upto payment (transfer actual amount via proxy contract)
   */
  async settle(
    paymentPayload: UptoPaymentPayload,
    requirements: UptoPaymentRequirements,
    settlementAmount: string,
  ): Promise<SettleResponse> {
    if (!this.privateKey) {
      return {
        success: false,
        transaction: '',
        errorReason: 'settlement_failed',
        network: paymentPayload.accepted.network,
      };
    }

    try {
      const { signature, permit2Authorization } = paymentPayload.payload;
      const payer = permit2Authorization.from;
      const settleAmountBigInt = BigInt(settlementAmount);

      // Validate settlement amount doesn't exceed authorized max
      if (settleAmountBigInt > BigInt(permit2Authorization.permitted.amount)) {
        return {
          success: false,
          transaction: '',
          errorReason: 'invalid_upto_evm_payload_settlement_exceeds_amount',
          payer,
          network: paymentPayload.accepted.network,
        };
      }

      // Zero settlement — no on-chain tx needed
      if (settleAmountBigInt === 0n) {
        console.log(`✅ Upto zero settlement for ${payer} (no charge)`);
        return {
          success: true,
          transaction: '',
          network: paymentPayload.accepted.network,
          payer,
        };
      }

      // Verify first (using the permitted.amount as the requirement for sig verification)
      const verifyRequirements: UptoPaymentRequirements = {
        ...requirements,
        amount: permit2Authorization.permitted.amount,
      };
      const verification = await this.verify(paymentPayload, verifyRequirements);
      if (!verification.isValid) {
        return {
          success: false,
          transaction: '',
          errorReason: verification.invalidReason,
          payer: verification.payer,
          network: paymentPayload.accepted.network,
        };
      }

      // Build settle args (mirrors CDP buildUptoPermit2SettleArgs)
      const facilitatorAddress = this.getSignerAddress()!;
      const settleArgs = [
        {
          permitted: {
            token: getAddress(permit2Authorization.permitted.token),
            amount: BigInt(permit2Authorization.permitted.amount),
          },
          nonce: BigInt(permit2Authorization.nonce),
          deadline: BigInt(permit2Authorization.deadline),
        },
        settleAmountBigInt,
        getAddress(payer),
        {
          to: getAddress(permit2Authorization.witness.to),
          facilitator: getAddress(facilitatorAddress),
          validAfter: BigInt(permit2Authorization.witness.validAfter),
        },
        signature as Hex,
      ] as const;

      // Create wallet client
      const account = privateKeyToAccount(this.privateKey);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(this.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain: base,
        transport: http(this.rpcUrl),
      });

      console.log(`💸 Settling upto payment on Base...`);
      console.log(`   From: ${payer}`);
      console.log(`   To: ${permit2Authorization.witness.to}`);
      console.log(`   Max authorized: ${formatUnits(BigInt(permit2Authorization.permitted.amount), 6)} USDC`);
      console.log(`   Settlement amount: ${formatUnits(settleAmountBigInt, 6)} USDC`);

      // Call x402UptoPermit2Proxy.settle()
      const hash = await walletClient.writeContract({
        address: UPTO_PROXY_ADDRESS,
        abi: UPTO_PROXY_ABI,
        functionName: 'settle',
        args: settleArgs,
      });

      console.log(`   Tx Hash: ${hash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log(`✅ Upto settlement successful!`);
        return {
          success: true,
          transaction: hash,
          network: paymentPayload.accepted.network,
          payer,
        };
      } else {
        console.log(`❌ Upto settlement failed - transaction reverted`);
        return {
          success: false,
          errorReason: 'settlement_failed',
          transaction: hash,
          network: paymentPayload.accepted.network,
          payer,
        };
      }
    } catch (error) {
      console.error('Upto settlement error:', error);
      return {
        success: false,
        transaction: '',
        errorReason: 'settlement_failed',
        network: paymentPayload.accepted.network,
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
}
