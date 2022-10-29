build:
	cargo build-bpf
clean:
	cargo clean
local:
	solana program deploy ./target/deploy/bank.so --url localhost
devnet:
	solana program deploy ./target/deploy/bank.so --url devnet
