/**
 * Server-safe Soroban helpers.
 *
 * Deliberately separate from `@/lib/tx`, which imports the Freighter browser
 * wallet: this module is safe to use from Server Actions and route handlers.
 * Anything that requires a private key stays in the browser — the server only
 * builds/simulates the transaction and submits the signed envelope back.
 */

import {
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc as StellarRpc,
  xdr,
} from "@stellar/stellar-sdk";

export interface SorobanConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export interface SubmittedTransaction {
  hash: string;
  status: string;
}

export function sorobanConfigFromEnv(): SorobanConfig {
  return {
    contractId: process.env.NEXT_PUBLIC_CONTRACT_ID || "CDUMMY",
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      "https://soroban-testnet.stellar.org",
    networkPassphrase:
      process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  };
}

export const addressToScVal = (address: string): xdr.ScVal =>
  Address.fromString(address).toScVal();

export const u64ToScVal = (value: number | bigint | string): xdr.ScVal =>
  nativeToScVal(BigInt(value), { type: "u64" });

export const i128ToScVal = (value: bigint): xdr.ScVal => nativeToScVal(value, { type: "i128" });

export const stringToScVal = (value: string): xdr.ScVal =>
  nativeToScVal(value, { type: "string" });

/** Convert a decimal amount such as `"12.5"` into its smallest-unit integer. */
export function toRawAmount(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const padded = frac.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/**
 * Build and simulate a contract method call, returning the assembled XDR that
 * the user's wallet still has to sign.
 */
export async function buildContractCallXdr(
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
  config: SorobanConfig
): Promise<string> {
  const server = new StellarRpc.Server(config.rpcUrl);
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(config.contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(simulated)) {
    throw new Error(`Transaction simulation failed: ${simulated.error}`);
  }

  return StellarRpc.assembleTransaction(tx, simulated).build().toXDR();
}

/** Submit a signed envelope and wait (bounded) for its result. */
export async function submitSignedXdr(
  signedXdr: string,
  config: SorobanConfig,
  timeout = 30000
): Promise<SubmittedTransaction> {
  const server = new StellarRpc.Server(config.rpcUrl);
  const tx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);

  const sendResponse = await server.sendTransaction(tx);
  if (sendResponse.status === "ERROR") {
    throw new Error("Transaction failed to submit");
  }

  let status: string = sendResponse.status;
  const startTime = Date.now();
  while (status === "PENDING" && Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const txResponse = await server.getTransaction(sendResponse.hash);
    status = txResponse.status as string;
  }

  if (status === "PENDING") {
    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
  }
  if (status === "ERROR") {
    throw new Error("Transaction failed during execution");
  }

  return { hash: sendResponse.hash, status };
}
