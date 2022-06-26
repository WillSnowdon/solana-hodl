import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SolanaHodl } from "./solana_hodl";
import IDL from "./solana_hodl.json";

const programAddress = "2vcJC7mS5WqnRcxw3rx6EN9JevWz9fGPqZAdMzWVDHrh";

export function getAnchorEnvironmet(
  wallet: anchor.Wallet,
  connection: anchor.web3.Connection
): [Program<SolanaHodl>, anchor.Provider] {
  //   const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);
  const program: Program<SolanaHodl> = new anchor.Program(
    IDL as any as SolanaHodl,
    programAddress
  );

  return [program, provider];
}
