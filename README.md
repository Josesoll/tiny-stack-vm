[![make.fun · tiny-stack-vm-01-run-20261122](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)
[![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Josesoll/tiny-stack-vm/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122/leaderboard)
[![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Josesoll/tiny-stack-vm/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

# Tiny Stack VM

An exact interpreter for make.fun's tiny stack ISA v1 in one Node program
(`main.ts`): wrapping 32-bit arithmetic, unsigned divide/remainder/compare,
5-bit shift counts, all ten traps with their own exit codes, and the step
and output limits, checked in the reference VM's order. It reads every
instance under /input and writes stdout.bin and exit.txt under /output.
