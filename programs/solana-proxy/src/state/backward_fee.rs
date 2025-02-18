use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct BackwardFee {
    pub bump: u8,
    pub order_backward_fee: u64,
    pub usdc_backward_fee: u64,
}
