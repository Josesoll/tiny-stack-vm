// Tiny stack VM: an exact interpreter for make.fun's tiny stack ISA v1.
// One step, in the reference's order: step-limit check, pc range check,
// opcode known, immediate fits, stack under/overflow, then the
// instruction's own trap. Values live in Int32Arrays so every result
// wraps to signed 32 bits exactly as the machine specifies.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p, q) {
  const S = new Int32Array(256); // data stack, at most 256 values
  const C = new Int32Array(64); // call stack, at most 64 return addresses
  const M = new Int32Array(256); // memory words, all zero at the start
  const O = new Uint8Array(65536); // output buffer, capped by trap 11
  let sp = 0, cp = 0, pc = 0, ip = 0, ol = 0, st = 0;
  const end = (c) => ({ o: O.slice(0, ol), c });
  for (;;) {
    if (st === 1000000) return end(10); // step limit beats every other trap
    if (pc < 0 || pc >= p.length) return end(9); // fell off or jumped out
    const op = p[pc];
    const known = op < 8 || (op >= 16 && op < 35 && op !== 31) ||
      (op >= 48 && op < 53) || op === 64 || op === 65 || (op >= 80 && op < 84);
    if (!known) return end(5);
    const im = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
    if (pc + im >= p.length) return end(9); // immediate cut off by the end
    st++;
    const nx = pc + 1 + im;
    // Pops and pushes of this opcode, for traps 2 and 3, checked before
    // any of the instruction's own traps or effects.
    let pp = 0, pu = 0;
    if (op === 1 || op === 2 || op === 82) pu = 1;
    else if (op === 3 || op === 49 || op === 50 || op === 80 || op === 81 || op === 83) pp = 1;
    else if (op === 4) { pp = 1; pu = 2; }
    else if (op === 5) { pp = 2; pu = 2; }
    else if (op === 6) { pp = 2; pu = 3; }
    else if (op === 7) { pp = 3; pu = 3; }
    else if (op >= 16 && op < 35) { if (op === 23 || op === 27) { pp = 1; pu = 1; } else { pp = 2; pu = 1; } }
    else if (op === 64) { pp = 1; pu = 1; }
    else if (op === 65) pp = 2;
    if (sp < pp) return end(2);
    if (sp - pp + pu > 256) return end(3);
    pc = nx;
    // Binary operators (0x10-0x22 except NEG 0x17 and NOT 0x1b): pop b, pop a.
    if (op >= 16 && op < 35 && op !== 23 && op !== 27) {
      const b = S[sp - 1], a = S[sp - 2];
      if (op >= 19 && op <= 22 && b === 0) return end(4);
      let r;
      if (op === 16) r = a + b | 0;
      else if (op === 17) r = a - b | 0;
      else if (op === 18) r = Math.imul(a, b); // low 32 bits of the exact product
      else if (op === 19) r = a === -2147483648 && b === -1 ? a : a / b | 0;
      else if (op === 20) r = b === -1 ? 0 : a % b | 0; // remainder takes a's sign
      else if (op === 21) r = (a >>> 0) / (b >>> 0) | 0; // DIVU: unsigned in, signed out
      else if (op === 22) r = (a >>> 0) % (b >>> 0) | 0;
      else if (op === 24) r = a & b;
      else if (op === 25) r = a | b;
      else if (op === 26) r = a ^ b;
      else if (op === 28) r = a << (b & 31); // shift counts use the low 5 bits only
      else if (op === 29) r = a >> (b & 31);
      else if (op === 30) r = a >>> (b & 31) | 0;
      else if (op === 32) r = a === b ? 1 : 0;
      else if (op === 33) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU compares unsigned
      S[--sp - 1] = r;
      continue;
    }
    switch (op) {
      case 0: return end(0); // HALT
      case 1: S[sp++] = (p[nx - 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 2: S[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
      case 3: sp--; break; // POP
      case 4: S[sp] = S[sp - 1]; sp++; break; // DUP
      case 5: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; } // SWAP
      case 6: S[sp] = S[sp - 2]; sp++; break; // OVER
      case 7: { const a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break; } // ROT
      case 23: S[sp - 1] = -S[sp - 1] | 0; break; // NEG wraps on -2^31
      case 27: S[sp - 1] = ~S[sp - 1]; break; // NOT
      case 48: case 49: case 50: { // JMP, JZ, JNZ: signed 16-bit relative offset
        const rel = ((p[nx - 2] | p[nx - 1] << 8) << 16) >> 16;
        let take = op === 48;
        if (op !== 48) { const v = S[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel; // target checked at the next step, not here
        break;
      }
      case 51: // CALL: unsigned absolute address
        if (cp === 64) return end(7);
        C[cp++] = nx; pc = p[nx - 2] | p[nx - 1] << 8; break;
      case 52: // RET
        if (cp === 0) return end(8);
        pc = C[--cp]; break;
      case 64: { // LOAD
        const a = S[sp - 1];
        if (a < 0 || a > 255) return end(6);
        S[sp - 1] = M[a]; break;
      }
      case 65: { // STORE: ( v addr -- ), addr on top
        const a = S[sp - 1];
        if (a < 0 || a > 255) return end(6);
        M[a] = S[sp - 2]; sp -= 2; break;
      }
      case 80: { // PRINT: decimal ASCII; writes nothing if it would overflow
        const s = String(S[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) O[ol++] = s.charCodeAt(i);
        break;
      }
      case 81: // PUTC
        if (ol + 1 > 65536) return end(11);
        O[ol++] = S[--sp] & 255; break;
      case 82: S[sp++] = ip < q.length ? q[ip++] : -1; break; // IN: -1 forever at end
      case 83: return end(S[--sp] & 255); // EXIT keeps only the low byte
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const W = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(W, id), { recursive: true });
  writeFileSync(join(W, id, 'stdout.bin'), r.o);
  writeFileSync(join(W, id, 'exit.txt'), r.c + '\n');
}
