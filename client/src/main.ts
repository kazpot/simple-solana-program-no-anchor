import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "mz/fs";
import * as borsh from "borsh";
import path from "path";
import { createKeypairFromFile, getPayer, getRpcUrl } from "./util";

const PROGRAM_PATH = path.resolve(__dirname, "../../program");
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, "target/deploy/bank.so");
const PROGRAM_KEYPAIR_PATH = path.join(
  PROGRAM_PATH,
  "target/deploy/bank-keypair.json"
);

class BankAccount {
  balance = 0;
  constructor(fields: { balance: number } | undefined = undefined) {
    if (fields) {
      this.balance += fields.balance;
    }
  }
}

const BankSchema = new Map([
  [BankAccount, { kind: "struct", fields: [["balance", "u32"]] }],
]);

const BANK_SIZE = borsh.serialize(BankSchema, new BankAccount()).length;

(async () => {
  // 1. establish connection
  const rpcUrl = await getRpcUrl();
  let connection = new Connection(rpcUrl, "confirmed");
  const version = await connection.getVersion();
  console.log("Connection to cluster established:", rpcUrl, version);

  // 2. establish payer
  let fees = 0;
  const { feeCalculator } = await connection.getRecentBlockhash();
  fees += await connection.getMinimumBalanceForRentExemption(BANK_SIZE);
  fees += feeCalculator.lamportsPerSignature * 100; // wag
  let payer: Keypair = await getPayer();

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  // 3. check program
  let programId: PublicKey;
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``
    );
  }

  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        "Program needs to be deployed with `solana program deploy dist/program/helloworld.so`"
      );
    } else {
      throw new Error("Program needs to be built and deployed");
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }

  const BANK_SEED = "bank";
  let toPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    BANK_SEED,
    programId
  );

  const account = await connection.getAccountInfo(toPubkey);
  if (account === null) {
    const lamports = await connection.getMinimumBalanceForRentExemption(
      BANK_SIZE
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: BANK_SEED,
        newAccountPubkey: toPubkey,
        lamports,
        space: BANK_SIZE,
        programId,
      })
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }

  // 4. send transaction
  const instruction = new TransactionInstruction({
    keys: [{ pubkey: toPubkey, isSigner: false, isWritable: true }],
    programId,
    data: Buffer.alloc(0),
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer]
  );

  // 5. check result
  const accountInfo = await connection.getAccountInfo(toPubkey);
  if (accountInfo === null) {
    throw "Error: cannot find the bank account";
  }
  const bankAccount = borsh.deserialize(
    BankSchema,
    BankAccount,
    accountInfo.data
  );
  console.log(bankAccount);
})();
