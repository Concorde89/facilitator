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
   * Supports gasless mode where facilitator is fee payer but user pays USDC
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
      let feePayer: string;
      let usdcPayer: string;

      const facilitatorAddress = this.keypair?.publicKey.toBase58();

      try {
        // Try versioned transaction first
        transaction = VersionedTransaction.deserialize(txBuffer);
        feePayer = transaction.message.staticAccountKeys[0].toBase58();

        // In gasless mode, fee payer is facilitator but USDC payer is different
        // Try to find the actual token authority from the instructions
        if (facilitatorAddress && feePayer === facilitatorAddress) {
          // Gasless mode - look for token transfer authority in accounts
          // The token transfer instruction has: source ATA, dest ATA, authority
          // Authority is typically the 3rd account in a transfer instruction
          // For simplicity, assume the second account key is the actual user
          const accountKeys = transaction.message.staticAccountKeys;
          usdcPayer = accountKeys.length > 1 ? accountKeys[1].toBase58() : feePayer;
          console.log(`   Gasless mode detected: fee payer is facilitator`);
          console.log(`   USDC payer: ${usdcPayer}`);
        } else {
          usdcPayer = feePayer;
        }
      } catch {
        // Fall back to legacy transaction
        transaction = Transaction.from(txBuffer);
        feePayer = transaction.feePayer?.toBase58() || '';

        // In gasless mode, find actual USDC payer from instructions
        if (facilitatorAddress && feePayer === facilitatorAddress) {
          // Look through instructions to find token transfer authority
          const tokenTransferIx = transaction.instructions.find(
            ix => ix.programId.equals(TOKEN_PROGRAM_ID)
          );
          if (tokenTransferIx && tokenTransferIx.keys.length >= 3) {
            // SPL Token transfer: [source, destination, authority]
            usdcPayer = tokenTransferIx.keys[2].pubkey.toBase58();
          } else {
            // Fallback: check signers that aren't the facilitator
            const otherSigner = transaction.signatures.find(
              sig => sig.publicKey.toBase58() !== facilitatorAddress
            );
            usdcPayer = otherSigner?.publicKey.toBase58() || feePayer;
          }
          console.log(`   Gasless mode detected: fee payer is facilitator`);
          console.log(`   USDC payer: ${usdcPayer}`);
        } else {
          usdcPayer = feePayer;
        }
      }

      if (!feePayer) {
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
          payer: usdcPayer,
        };
      }

      // Check USDC payer's balance (not fee payer in gasless mode)
      const payerPubkey = new PublicKey(usdcPayer);
      const payerAta = await getAssociatedTokenAddress(usdcMint, payerPubkey);

      try {
        const tokenAccount = await getAccount(this.connection, payerAta);
        const requiredAmount = BigInt(requirements.maxAmountRequired);

        if (tokenAccount.amount < requiredAmount) {
          return {
            isValid: false,
            invalidReason: 'insufficient_funds',
            payer: usdcPayer,
          };
        }

        console.log(`✅ Solana verification passed for ${usdcPayer}`);
        console.log(`   Amount required: ${requirements.maxAmountRequired} USDC units`);
        console.log(`   Balance: ${tokenAccount.amount.toString()} USDC units`);

        return {
          isValid: true,
          payer: usdcPayer,
        };
      } catch (error) {
        // Token account doesn't exist
        return {
          isValid: false,
          invalidReason: 'insufficient_funds',
          payer: usdcPayer,
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
   * Supports gasless mode where facilitator pays SOL fees
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
      const facilitatorAddress = this.keypair?.publicKey.toBase58();

      try {
        // Try versioned transaction first
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        const txFeePayer = versionedTx.message.staticAccountKeys[0].toBase58();

        // Check if facilitator needs to sign as fee payer (gasless mode)
        if (this.keypair && txFeePayer === facilitatorAddress) {
          console.log(`   Gasless mode: Facilitator signing as fee payer`);
          versionedTx.sign([this.keypair]);
        }

        signature = await this.connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch {
        // Try legacy transaction
        const legacyTx = Transaction.from(txBuffer);
        const txFeePayer = legacyTx.feePayer?.toBase58();

        // Check if facilitator needs to sign as fee payer (gasless mode)
        if (this.keypair && txFeePayer === facilitatorAddress) {
          console.log(`   Gasless mode: Facilitator signing as fee payer`);
          legacyTx.partialSign(this.keypair);
        }

        // Send the transaction (now with facilitator signature if gasless)
        signature = await this.connection.sendRawTransaction(
          legacyTx.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          }
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
