use anchor_spl::token::Token;
use anchor_spl::token::{self, Mint, SetAuthority, TokenAccount, Transfer};
use anchor_lang::prelude::*;
use spl_token::instruction::AuthorityType;

declare_id!("2vcJC7mS5WqnRcxw3rx6EN9JevWz9fGPqZAdMzWVDHrh");

#[program]
pub mod solana_hodl {
    use super::*;

    const VAULT_PDA_SEED: &[u8] = b"vault";

    pub fn initialize_vault(
        ctx: Context<InitializeVault>
    ) -> Result<()> {
        let (vault_authority, _vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_PDA_SEED], ctx.program_id);
        token::set_authority(
            ctx.accounts.to_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority),
        )?;

        let token_vault = &mut ctx.accounts.token_vault;

        token_vault.token_account = ctx.accounts.vault_account.key();
        token_vault.owner = ctx.accounts.initializer.key();
        token_vault.bump = _vault_authority_bump;

        Ok(())
    }

    pub fn initialize_native_vault(
        ctx: Context<InitializeNativeVault>
    ) -> Result<()> {
       
        let token_vault = &mut ctx.accounts.token_vault;
        token_vault.owner = ctx.accounts.initializer.key();
        Ok(())
    }

    pub fn lockup_token(
        ctx: Context<LockupToken>,
        lockup_amount: u64,
        unlock_timestamp: i64,
    ) -> Result<()> {
        token::transfer(
            ctx.accounts.to_transfer_to_vault_context(),
            lockup_amount,
        )?;

        let token_lockup = &mut ctx.accounts.token_lockup;

        token_lockup.amount = lockup_amount;
        token_lockup.token_vault = ctx.accounts.token_vault.key();
        token_lockup.unlock_timestamp = unlock_timestamp;
        token_lockup.depositor = ctx.accounts.payer_deposit_token_account.key();
        token_lockup.receiver = ctx.accounts.payer_deposit_token_account.key();

        Ok(())
    }

    pub fn lockup_native_token(
        ctx: Context<LockupNativeToken>,
        lockup_amount: u64,
        unlock_timestamp: i64,
    ) -> Result<()> {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.token_vault.key(),
            lockup_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.token_vault.to_account_info()
            ],
        )?;

        let token_lockup = &mut ctx.accounts.token_lockup;

        token_lockup.amount = lockup_amount;
        token_lockup.token_vault = ctx.accounts.token_vault.key();
        token_lockup.unlock_timestamp = unlock_timestamp;
        token_lockup.depositor = ctx.accounts.payer.key();
        token_lockup.receiver = ctx.accounts.payer.key();

        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()>  {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        if current_timestamp < ctx.accounts.token_lockup.unlock_timestamp {
            return err!(UnlockTokensError::LockupIncomplete)
        }


        let authority_seeds = &[VAULT_PDA_SEED, &[ctx.accounts.token_vault.bump]];

        token::transfer(
            ctx.accounts.to_transfer_to_receiver_context().with_signer(&[&authority_seeds[..]]),
            ctx.accounts.token_lockup.amount,
        )?;
        
        Ok(())
    }

    pub fn unlock_native_tokens(ctx: Context<UnlockNativeTokens>) -> Result<()>  {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        if current_timestamp < ctx.accounts.token_lockup.unlock_timestamp {
            return err!(UnlockTokensError::LockupIncomplete)
        }
        
       
        let amount = ctx.accounts.token_lockup.amount;
        **ctx.accounts.token_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.receiver.try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

#[error_code]
pub enum UnlockTokensError {
    #[msg("Unable to unlock tokens because it's still in lockup period")]
    LockupIncomplete,
}

#[account]
pub struct TokenLockup {
    amount: u64,
    token_vault: Pubkey,
    unlock_timestamp: i64,
    depositor: Pubkey,
    receiver: Pubkey
}

#[account]
pub struct TokenVault {
    owner: Pubkey,
    token_account: Pubkey,
    bump: u8
}

#[account]
pub struct NativeTokenVault {
    owner: Pubkey,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(mut, signer)]
  pub payer: AccountInfo<'info>,

  #[account(
    mut,
    close = payer,
    constraint = token_vault.key() == token_lockup.token_vault.key(),
  )]
  pub token_lockup: Account<'info, TokenLockup>,

  #[account(
    constraint = token_vault.token_account == vault_account.key(),
    constraint = token_vault.owner == payer.key()
  )]
  pub token_vault: Account<'info, TokenVault>,

  #[account(
    mut,
    constraint = token_vault.token_account == vault_account.key()
  )]
  pub vault_account: Account<'info, TokenAccount>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  vault_authority: AccountInfo<'info>,

  #[account(
    mut,
    constraint = receiver.key() == token_lockup.receiver
  )]
  pub receiver: Account<'info, TokenAccount>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockNativeTokens<'info> {
  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(mut, signer)]
  pub payer: AccountInfo<'info>,

  #[account(
    mut,
    close = payer,
    constraint = token_vault.key() == token_lockup.token_vault.key(),
  )]
  pub token_lockup: Account<'info, TokenLockup>,

  #[account(
    mut,
    constraint = token_vault.owner == payer.key()
  )]
  pub token_vault: Account<'info, NativeTokenVault>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(
    mut,
    constraint = receiver.key() == token_lockup.receiver
  )]
  pub receiver: AccountInfo<'info>,

  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(lockup_amount: u64, unlock_timestamp: i64)]
pub struct LockupToken<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub payer: AccountInfo<'info>,

    #[account(
        constraint = token_vault.token_account == vault_account.key(),
        constraint = token_vault.owner == payer.key()
    )]
    pub token_vault: Account<'info, TokenVault>,

    #[account(
        mut,
        constraint = token_vault.token_account == vault_account.key()
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payer_deposit_token_account.amount >= lockup_amount
    )]
    pub payer_deposit_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 8 + 8, 
        seeds = [b"token-lockup", payer.key().as_ref(), token_vault.token_account.as_ref()], 
        bump
    )]
    pub token_lockup: Account<'info, TokenLockup>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
#[instruction(lockup_amount: u64, unlock_timestamp: i64)]
pub struct LockupNativeToken<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub payer: AccountInfo<'info>,

    #[account(
        mut,
        constraint = token_vault.owner == payer.key()
    )]
    pub token_vault: Account<'info, NativeTokenVault>,

    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 8 + 8, 
        seeds = [b"token-lockup", payer.key().as_ref(), token_vault.key().as_ref()], 
        bump
    )]
    pub token_lockup: Account<'info, TokenLockup>,

    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub initializer: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        seeds = [b"token-seed".as_ref(), mint.key().as_ref()],
        bump,
        payer = initializer,
        token::mint = mint,
        token::authority = initializer,
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = initializer,
        space = 8 + 32 + 32 + 1, 
        seeds = [b"token-vault", initializer.key().as_ref(), mint.key().as_ref()], 
        bump
    )]
    pub token_vault: Account<'info, TokenVault>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeNativeVault<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub initializer: AccountInfo<'info>,

    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = initializer,
        space = 8 + 32, 
        seeds = [b"native-token-vault", initializer.key().as_ref()], 
        bump
    )]
    pub token_vault: Account<'info, NativeTokenVault>,
    pub system_program: Program<'info, System>
}

impl<'info> InitializeVault<'info> {
    fn to_set_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.vault_account.to_account_info().clone(),
            current_authority: self.initializer.to_account_info().clone(),
        };

        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}


impl<'info> LockupToken<'info> {
    fn to_transfer_to_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .payer_deposit_token_account
                .to_account_info()
                .clone(),
            to: self.vault_account.to_account_info().clone(),
            authority: self.payer.clone(),
        };

        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}


impl<'info> UnlockTokens<'info> {
    fn to_transfer_to_receiver_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self
                .vault_account
                .to_account_info()
                .clone(),
            to: self.receiver.to_account_info().clone(),
            authority: self.vault_authority.clone(),
        };

        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}