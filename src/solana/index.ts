/**
 * Solana Facilitator
 * Handles verification and settlement for Solana mainnet/devnet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import type {
  SolanaPaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '../types/index.js';

// USDC mint addresses
const USDC_MINTS: Record<string, PublicKey> = {
  'solana': new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  'solana-devnet': new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
};

// Parse network to get connection URL context
function isDevnet(network: string): boolean {
  return network.includes('devnet') || network.includes('EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
}

export class SolanaFacilitator {
  private connection: Connection;
  private keypair: Keypair | null;
  private network: string;

  constructor(config: {
    rpcUrl: string;
    privateKey?: string;
    network?: string;
  }) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.network = config.network || 'solana';

    if (config.privateKey) {
      try {
        // Try base58 first
        const decoded = bs58.decode(config.privateKey);
        this.keypair = Keypair.fromSecretKey(decoded);
      } catch {
        // Try JSON array format
        try {
          const secretKey = new Uint8Array(JSON.parse(config.privateKey));
          this.keypair = Keypair.fromSecretKey(secretKey);
        } catch {
          console.error('Invalid Solana private key format');
          this.keypair = null;
        }
      }
    } else {
      this.keypair = null;
    }
  }

  /**
   * Verify a Solana payment transaction
   */
  async verify(
    paymentPayload: SolanaPaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      const { transaction: txBase64 } = paymentPayload.payload;

      // Decode the transaction
      const txBuffer = Buffer.from(txBase64, 'base64');
      let transaction: Transaction | VersionedTransaction;
      let payer: string;

      try {
        // Try versioned transaction first
        transaction = VersionedTransaction.deserialize(txBuffer);
        payer = transaction.message.staticAccountKeys[0].toBase58();
      } catch {
        // Fall back to legacy transaction
        transaction = Transaction.from(txBuffer);
        payer = transaction.feePayer?.toBase58() || '';
      }

      if (!payer) {
        return {
          isValid: false,
          invalidReason: 'invalid_payload',
        };
      }

      // Get USDC mint for this network
      const usdcMint = USDC_MINTS[paymentPayload.network];
      if (!usdcMint) {
        return {
          isValid: false,
          invalidReason: 'unsupported_network',
          payer,
        };
      }

      // Check payer's USDC balance
      const payerPubkey = new PublicKey(payer);
      const payerAta = await getAssociatedTokenAddress(usdcMint, payerPubkey);

      try {
        const tokenAccount = await getAccount(this.connection, payerAta);
        const requiredAmount = BigInt(requirements.maxAmountRequired);

        if (tokenAccount.amount < requiredAmount) {
          return {
            isValid: false,
            invalidReason: 'insufficient_funds',
            payer,
          };
        }

        console.log(`✅ Solana verification passed for ${payer}`);
        console.log(`   Amount required: ${requirements.maxAmountRequired} USDC units`);
        console.log(`   Balance: ${tokenAccount.amount.toString()} USDC units`);

        return {
          isValid: true,
          payer,
        };
      } catch (error) {
        // Token account doesn't exist
        return {
          isValid: false,
          invalidReason: 'insufficient_funds',
          payer,
        };
      }
    } catch (error) {
      console.error('Solana verification error:', error);
      return {
        isValid: false,
        invalidReason: 'unexpected_error',
      };
    }
  }

  /**
   * Settle a Solana payment (submit the pre-signed transaction)
   */
  async settle(
    paymentPayload: SolanaPaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
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

      const { transaction: txBase64 } = paymentPayload.payload;
      const txBuffer = Buffer.from(txBase64, 'base64');

      console.log(`💸 Settling payment on Solana...`);
      console.log(`   Payer: ${verification.payer}`);
      console.log(`   Amount: ${requirements.maxAmountRequired} USDC units`);

      let signature: string;

      try {
        // Try versioned transaction
        const versionedTx = VersionedTransaction.deserialize(txBuffer);

        // If we have a keypair, we might need to add fee payer signature
        if (this.keypair) {
          // The transaction should already be signed by the payer
          // We just submit it
        }

        signature = await this.connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch {
        // Try legacy transaction
        const legacyTx = Transaction.from(txBuffer);

        if (this.keypair && !legacyTx.feePayer) {
          legacyTx.feePayer = this.keypair.publicKey;
        }

        signature = await sendAndConfirmTransaction(
          this.connection,
          legacyTx,
          this.keypair ? [this.keypair] : [],
          { commitment: 'confirmed' }
        );
      }

      console.log(`   Signature: ${signature}`);

      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        console.log(`❌ Settlement failed`);
        return {
          success: false,
          errorReason: 'settlement_failed',
          transaction: signature,
          network: paymentPayload.network,
          payer: verification.payer,
        };
      }

      console.log(`✅ Settlement successful!`);
      return {
        success: true,
        transaction: signature,
        network: paymentPayload.network,
        payer: verification.payer,
      };
    } catch (error) {
      console.error('Solana settlement error:', error);
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
    if (!this.keypair) return null;
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return [
      'solana',
      'solana-devnet',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    ];
  }
}
