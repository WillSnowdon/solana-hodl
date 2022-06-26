import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { TokenInstructions } from "@project-serum/serum";
import { getAccount, NATIVE_MINT } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { SolanaHodl } from "../target/types/solana_hodl";

describe("solana-hodl", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaHodl as Program<SolanaHodl>;

  let accounts: {
    mint: PublicKey;
    from: PublicKey;
    vault_account_pda: PublicKey;
    vault_info_pda: PublicKey;
    vault_authority_pda: PublicKey;
    token_lockup_pda: PublicKey;
  };

  const initialize = async (native = false) => {
    const mint = native ? NATIVE_MINT : await createMint(provider);
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        provider.wallet.publicKey,
        LAMPORTS_PER_SOL * 2
      ),
      "confirmed"
    );

    const [_vault_account_pda, _vault_account_bump] =
      await PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("token-seed")),
          mint.toBuffer(),
        ],
        program.programId
      );
    const vault_account_pda = _vault_account_pda;

    const from = native
      ? provider.wallet.publicKey
      : await createTokenAccount(provider, mint, provider.wallet.publicKey);

    const [vaultInfoPDA, _] = await PublicKey.findProgramAddress(
      native
        ? [
            anchor.utils.bytes.utf8.encode("native-token-vault"),
            provider.wallet.publicKey.toBuffer(),
          ]
        : [
            anchor.utils.bytes.utf8.encode("token-vault"),
            provider.wallet.publicKey.toBuffer(),
            mint.toBuffer(),
          ],
      program.programId
    );

    const vault_info_pda = vaultInfoPDA;

    const [tokenLockupPDA, _tl] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode("token-lockup"),
        provider.wallet.publicKey.toBuffer(),
        native ? vault_info_pda.toBuffer() : vault_account_pda.toBuffer(),
      ],
      program.programId
    );

    const token_lockup_pda = tokenLockupPDA;

    const [_vault_authority_pda, _vault_authority_bump] =
      await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("vault"))],
        program.programId
      );
    const vault_authority_pda = _vault_authority_pda;

    return {
      mint,
      from,
      vault_account_pda,
      vault_info_pda,
      vault_authority_pda,
      token_lockup_pda,
    };
  };

  describe("spl", () => {
    it("Initializes test state", async () => {
      accounts = await initialize();
    });

    it("Is initialized!", async () => {
      // Add your test here.
      await program.methods
        .initializeVault()
        .accounts({
          initializer: provider.wallet.publicKey,
          vaultAccount: accounts.vault_account_pda,
          mint: accounts.mint,
          tokenVault: accounts.vault_info_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const tokenVault = await program.account.tokenVault.all([
        {
          memcmp: {
            bytes: provider.wallet.publicKey.toString(),
            //  8
            offset: 8,
          },
        },
      ]);

      const acc = await getAccount(
        provider.connection,
        tokenVault[0].account.tokenAccount
      );
    });

    it("creates token lockup", async () => {
      // Add your test here.
      await program.methods
        .lockupToken(
          new anchor.BN(5000),
          new anchor.BN(Math.floor(Date.now() / 1000) - 10)
        )
        .accounts({
          payer: provider.wallet.publicKey,
          payerDepositTokenAccount: accounts.from,
          tokenVault: accounts.vault_info_pda,
          vaultAccount: accounts.vault_account_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenLockup: accounts.token_lockup_pda,
        })
        .rpc();

      // Creates lockup
      const tokenLockups = await program.account.tokenLockup.all();
      expect(tokenLockups).length(1);

      const tokenVault = await program.account.tokenVault.all();
      const acc = await getAccount(
        provider.connection,
        tokenVault[0].account.tokenAccount
      );

      expect(acc.amount).equals(BigInt(5000));
    });

    it("unloks tokens", async () => {
      await program.methods
        .unlockTokens()
        .accounts({
          payer: provider.wallet.publicKey,
          tokenVault: accounts.vault_info_pda,
          vaultAccount: accounts.vault_account_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenLockup: accounts.token_lockup_pda,
          receiver: accounts.from,
          vaultAuthority: accounts.vault_authority_pda,
        })
        .rpc();

      const tokenLockups = await program.account.tokenLockup.all();
      // Closes account
      expect(tokenLockups).length(0);
    });
  });

  describe("SOL", () => {
    it("Initializes test state", async () => {
      accounts = await initialize(true);
    });

    it("Is initialized!", async () => {
      // Add your test here.
      await program.methods
        .initializeNativeVault()
        .accounts({
          initializer: provider.wallet.publicKey,
          mint: accounts.mint,
          tokenVault: accounts.vault_info_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const tokenVault = await program.account.tokenVault.all([
        {
          memcmp: {
            bytes: provider.wallet.publicKey.toString(),
            //  8
            offset: 8,
          },
        },
      ]);

      const acc = await getAccount(
        provider.connection,
        tokenVault[0].account.tokenAccount
      );
    });

    it("creates native token lockup", async () => {
      const balance = await provider.connection.getBalance(
        accounts.vault_info_pda
      );
      // Add your test here.
      await program.methods
        .lockupNativeToken(
          new anchor.BN(5000),
          new anchor.BN(Math.floor(Date.now() / 1000) - 2)
        )
        .accounts({
          payer: provider.wallet.publicKey,
          tokenVault: accounts.vault_info_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenLockup: accounts.token_lockup_pda,
        })
        .rpc();

      const updatedBalance = await provider.connection.getBalance(
        accounts.vault_info_pda
      );

      expect(updatedBalance).equals(balance + 5000);
    });

    it("unloks tokens", async () => {
      const balance = await provider.connection.getBalance(
        accounts.vault_info_pda
      );
      await program.methods
        .unlockNativeTokens()
        .accounts({
          payer: provider.wallet.publicKey,
          tokenVault: accounts.vault_info_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenLockup: accounts.token_lockup_pda,
          receiver: provider.wallet.publicKey,
        })
        .rpc();

      const tokenLockups = await program.account.tokenLockup.all();
      // Closes account
      expect(tokenLockups).length(0);

      const updatedBalance = await provider.connection.getBalance(
        accounts.vault_info_pda
      );

      expect(updatedBalance).equals(balance - 5000);
    });
  });
});

// TODO: remove this constant once @project-serum/serum uses the same version
//       of @solana/web3.js as anchor (or switch packages).
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  TokenInstructions.TOKEN_PROGRAM_ID.toString()
);

async function createMint(provider, authority?: any) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = anchor.web3.Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, [mint]);

  return mint.publicKey;
}

async function createMintInstructions(provider, authority, mint) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint,
      decimals: 0,
      mintAuthority: authority,
    }),
  ];
  return instructions;
}

async function createTokenAccount(provider, mint, owner) {
  const vault = anchor.web3.Keypair.generate();
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner))
  );
  await provider.sendAndConfirm(tx, [vault]);
  return vault.publicKey;
}

async function createTokenAccountInstrs(
  provider,
  newAccountPubkey,
  mint,
  owner,
  lamports?: number
) {
  if (lamports === undefined) {
    lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
  }
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: newAccountPubkey,
      mint,
      owner,
    }),
    TokenInstructions.mintTo({
      mintAuthority: provider.wallet.publicKey,
      amount: 100000,
      destination: newAccountPubkey,
      mint,
    }),
  ];
}
