/**
 * Slim Solana web3 + SPL token UMD for Gladiator (includes VersionedTransaction).
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  MessageV0,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";
import { Buffer } from "buffer";

const solanaWeb3 = {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  MessageV0,
  LAMPORTS_PER_SOL,
  Buffer,
};

const splToken = {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createTransferCheckedInstruction,
  getAccount,
};

if (typeof window !== "undefined") {
  window.solanaWeb3 = solanaWeb3;
  window.splToken = splToken;
  if (typeof window.Buffer === "undefined") window.Buffer = Buffer;
}

export { solanaWeb3, splToken };
