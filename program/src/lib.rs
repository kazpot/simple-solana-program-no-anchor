use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    program_error::ProgramError,
    msg,
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct BankAccount {
    pub balance: u32
}

entrypoint!(increase_balance);

pub fn increase_balance(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    msg!("start increase_balance");
    let accounts_iter = &mut accounts.iter();
    let account = next_account_info(accounts_iter)?;

    // account must be owned by the program in order to modify its data
    if account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut bank_account = BankAccount::try_from_slice(&account.data.borrow())?;
    bank_account.balance += 1;
    bank_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;
    use std::mem;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = vec![0; mem::size_of::<u32>()];
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data: Vec<u8> = Vec::new();

        let accounts = vec![account];

        assert_eq!(
            BankAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .balance,
            0
        );
        increase_balance(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            BankAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .balance,
            1
        );
        increase_balance(&program_id, &accounts, &instruction_data).unwrap();
        assert_eq!(
            BankAccount::try_from_slice(&accounts[0].data.borrow())
                .unwrap()
                .balance,
            2
        );
    }
}

