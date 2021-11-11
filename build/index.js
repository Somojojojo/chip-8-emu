"use strict";
var GPUColor;
(function (GPUColor) {
    GPUColor["Black"] = "#000";
    GPUColor["White"] = "#FFF";
})(GPUColor || (GPUColor = {}));
class Chip8 {
    constructor(canvasContext2D) {
        this.canvasContext2D = canvasContext2D;
        this.memory = new Uint8Array(4096);
        this.pc = Chip8.START_ADDRESS;
        this.I = 0;
        this.opcode = 0;
        this.stack = new Array(16);
        this.sp = 0;
        this.keypad = new Uint8Array(16);
        this._halt = false;
        this.shouldRedraw = true;
        this.graphics = new Array(Chip8.SCREEN_WIDTH).fill(new Array(Chip8.SCREEN_HEIGHT).fill(GPUColor.White));
        /**
         * CPU Registers
         * There are 15 registers, each 8-bits in size.
         */
        this.V = new Uint8Array(15);
        /**
         * When set above zero these timers will decrement (on vblank).
         * The system's buzzer sounds when `soundTimer` reaches zero.
         */
        this.delayTimer = 0;
        this.soundTimer = 0;
        this.pc = Chip8.START_ADDRESS;
        this.opcode = 0;
        this.I = 0;
        this.sp = 0;
        // Clear display
        // Clear stack
        this.stack = new Array(16);
        // Clear registers V0-VF
        this.V = new Uint8Array(15);
        // Clear memory
        this.memory = new Uint8Array(4096);
        // Load fontset
        Chip8.FONTSET
            .forEach((fontAddress, index) => {
            this.memory[index + Chip8.FONTSET_START_ADDRESS] = fontAddress;
        });
        // Reset timers
        this.delayTimer = 0;
        this.soundTimer = 0;
    }
    get VF() {
        return this.V[0xF];
    }
    set VF(value) {
        this.V[0xF] = value;
    }
    /**
     * Start the emulator.
     */
    start() {
        this.cycle();
        this.handleKeyEvents();
    }
    /**
     * Load a Chip-8 binary.
     * @param path location of the ROM
     */
    async loadProgram(path) {
        const response = await fetch(path);
        if (response.ok) {
            let arrayBuffer = new Uint8Array(await response.arrayBuffer());
            arrayBuffer.forEach((data, index) => {
                this.memory[index + Chip8.START_ADDRESS] = arrayBuffer[index];
            });
        }
    }
    halt() {
        this._halt = true;
    }
    cycle() {
        const nextFrame = performance.now() + (200 * 1);
        if (this._halt) {
            return;
        }
        if (this.memory.length > this.pc) {
            this.opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
            this.pc += 2;
            this.handleOpCode(this.opcode);
            if (this.delayTimer > 0) {
                this.delayTimer--;
            }
            if (this.soundTimer > 0) {
                if (this.soundTimer === 1) {
                    console.log('BEEP!');
                }
                this.soundTimer--;
            }
            if (this.shouldRedraw) {
                this.shouldRedraw = false;
                this.drawScreen();
            }
            if (performance.now() >= nextFrame) { // We're late... Darn.
                this.cycle();
            }
            else {
                setTimeout(this.cycle.bind(this), nextFrame - performance.now());
            }
        }
        else {
            console.log('Done!');
        }
    }
    handleKeyEvents() {
        document.addEventListener('keyup', (event) => {
            console.log(`Key pressed: ${event.key}`);
            this.keypad[Chip8.KEYMAP[event.key.toUpperCase()]] = 0;
        });
        document.addEventListener('keydown', (event) => {
            console.log(`Key pressed: ${event.key}`);
            this.keypad[Chip8.KEYMAP[event.key.toUpperCase()]] = 1;
        });
    }
    drawScreen() {
        const context = this.canvasContext2D;
        context.clearRect(0, 0, Chip8.SCREEN_WIDTH, Chip8.SCREEN_HEIGHT);
        this.graphics.forEach((row, x) => {
            row.forEach((pixel, y) => {
                context.fillStyle = pixel;
                context.fillRect(x, y, 1, 1);
            });
        });
    }
    handleOpCode(opcode) {
        console.groupCollapsed(`Handling Next OPCode (0x${opcode.toString(16)})`);
        console.log(`opcode: 0x${opcode.toString(16)} (${opcode})`);
        console.log(`registers`, this.V);
        console.log(`memory`, this.memory);
        console.log(`graphics`, this.graphics);
        console.groupEnd();
        let Vx = this.V[(opcode & 0x0F00) >> 8];
        let Vy = this.V[(opcode & 0x00F0) >> 4];
        switch (opcode & 0xF000) {
            case 0x0000:
                switch (opcode & 0x00FF) {
                    case 0x00E0: { // 0x00E0 clears the screen
                        this.graphics = new Array(Chip8.SCREEN_WIDTH).fill(new Array(Chip8.SCREEN_HEIGHT).fill(GPUColor.White));
                        console.log('Clearing the screen');
                        break;
                    }
                    case 0x00EE: { // 0x00EE returns from subroutine
                        this.sp--;
                        this.pc = this.stack[this.sp];
                        break;
                    }
                }
                break;
            case 0x1000: { // 1NNN: Jumps to address NNN
                this.pc = opcode & 0x0FFF;
                break;
            }
            case 0x2000: { // 2NNN: Calls subroutine at NNN
                this.stack[this.sp] = this.pc;
                this.sp++;
                this.pc = opcode & 0x0FFF;
                break;
            }
            case 0x3000: { // 3XNN: Skips the next instruction if Vx equals NN. (Usually the next instruction is a jump to skip a code block);
                const nn = opcode & 0x00FF;
                if (Vx === nn) {
                    this.pc += 2;
                }
                break;
            }
            case 0x4000: { // 4XNN: Skips the next instruction if Vx does not equal NN. (Usually the next instruction is a jump to skip a code block);
                const nn = opcode & 0x00FF;
                if (Vx !== nn) {
                    this.pc += 2;
                }
                break;
            }
            case 0x5000: { // 5XY0: Skips the next instruction if Vx equals Vy. (Usually the next instruction is a jump to skip a code block);
                if (Vx === Vy) {
                    this.pc += 2;
                }
                break;
            }
            case 0x6000: { // 6XNN: Sets Vx to NN.
                const nn = opcode & 0x00FF;
                Vx = nn;
                break;
            }
            case 0x7000: { // 7XNN: Adds NN to Vx. (Carry flag is not changed);
                const nn = opcode & 0x00FF;
                Vx = nn;
                break;
            }
            case 0x8000: { // Handles 8XY# opcodes
                switch (opcode & 0x000F) {
                    case 0x0000: { // 8XY0: Sets Vx to the value of Vy.
                        Vx = Vy;
                        break;
                    }
                    case 0x0001: { // 8XY1: Sets Vx to Vx or Vy. (Bitwise OR operation);
                        Vx |= Vy;
                        break;
                    }
                    case 0x0002: { // 8XY2: Sets Vx to Vx and Vy. (Bitwise AND operation);
                        Vx &= Vy;
                        break;
                    }
                    case 0x0003: { // 8XY3: Sets Vx to Vx xor Vy.
                        Vx ^= Vy;
                        break;
                    }
                    case 0x0004: { // 8XY4: Adds Vy to Vx. VF is set to 1 when there's a carry, and to 0 when there is not.
                        const sum = Vx + Vy;
                        if (sum > 255) {
                            this.VF = 1;
                        }
                        Vx += sum & 0xFF;
                        break;
                    }
                    case 0x0005: { // 8XY5: Vy is subtracted from Vx. VF is set to 0 when there's a borrow, and 1 when there is not.
                        if (Vx > Vy) {
                            this.VF = 1;
                        }
                        else {
                            this.VF = 0;
                        }
                        Vx -= Vy;
                        break;
                    }
                    case 0x0006: { // 8XY6: Stores the least significant bit of Vx in VF and then shifts Vx to the right by 1.
                        const lsb = Vx & 0xF;
                        this.VF = lsb;
                        Vx >>= 1;
                        break;
                    }
                    case 0x0007: { // 8XY7: Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and 1 when there is not.
                        if (Vy > Vx) {
                            this.VF = 1;
                        }
                        else {
                            this.VF = 0;
                        }
                        Vx -= Vy;
                        break;
                    }
                    case 0x000E: { // 8XYE: Stores the most significant bit of VX in VF and then shifts VX to the left by 1.
                        const msb = (Vx & 0x80) >> 7;
                        this.VF = msb;
                        Vx <<= 1;
                        break;
                    }
                }
                break;
            }
            case 0x9000: { // 9XY0: Skips the next instruction if VX does not equal VY. (Usually the next instruction is a jump to skip a code block);
                if (Vx !== Vy) {
                    this.pc += 2;
                }
            }
            case 0xA000: { // ANNN: Sets index regsiter to address NNN
                this.I = opcode & 0x0FFF;
                break;
            }
            case 0xB000: { // BNNN: Jumps to the address NNN plus V0.
                this.pc = this.V[0] + (opcode & 0x0FFF);
                break;
            }
            case 0xC000: { // CXNN: Sets VX to the result of a bitwise AND operation on a random number (Typically: 0 to 255) and NN.
                Vx = (255 * Math.random()) & (opcode & 0x00FF);
                break;
            }
            case 0xD000: { // DXYN: Draws a sprite at coordinate (VX, VY) that has a width of 8 pixels and a height of N pixels. Each row of 8 pixels is read as bit-coded starting from memory location I; I value does not change after the execution of this instruction. As described above, VF is set to 1 if any screen pixels are flipped from set to unset when the sprite is drawn, and to 0 if that does not happen
                const height = opcode & 0x000F; // N
                // Clear VF (collision)
                this.VF = 0;
                for (let x = Vy; x < Vy + height; x++) {
                    for (let y = Vx; y < Vx + 8; y++) {
                        let pixel = this.graphics[x][y];
                        if (pixel !== GPUColor.White) {
                            this.VF = 1;
                        }
                        else {
                            this.shouldRedraw = true;
                        }
                        this.graphics[x][y] = GPUColor.Black;
                    }
                }
                break;
            }
            case 0xE000: { // Handles EX## opcodes
                switch (opcode & 0x000F) {
                    case 0x000E: { // EX9E: Skips the next instruction if the key stored in VX is pressed. (Usually the next instruction is a jump to skip a code block);
                        if (this.keypad[Vx]) {
                            this.pc += 2;
                        }
                        break;
                    }
                    case 0x0001: { // EXA1: Skips the next instruction if the key stored in VX is not pressed. (Usually the next instruction is a jump to skip a code block);
                        if (!this.keypad[Vx]) {
                            this.pc += 2;
                        }
                        break;
                    }
                }
                break;
            }
            case 0xF000: { // Handles FX## opcodes
                switch (opcode & 0x00FF) {
                    case 0x0007: { // FX07: Sets VX to the value of the delay timer.
                        Vx = this.delayTimer;
                        break;
                    }
                    case 0x000A: { // FX0A: A key press is awaited, and then stored in VX. (Blocking Operation. All instruction halted until next key event);
                        this.pc -= 2;
                        const keys = Object.keys(this.keypad);
                        for (let index = 0; index >= keys.length; index++) {
                            const key = keys[index];
                            if (this.keypad[Chip8.KEYMAP[key]] === 1) {
                                Vx = Chip8.KEYMAP[key];
                                break;
                            }
                        }
                        break;
                    }
                    case 0x0015: { // FX15: Sets the delay timer to VX
                        this.delayTimer = Vx;
                        break;
                    }
                    case 0x0018: { // FX18: Sets the delay timer to VX
                        this.soundTimer = Vx;
                        break;
                    }
                    case 0x001E: { // FX1E: Adds VX to I. VF is not affected.
                        this.I += Vx;
                        break;
                    }
                    case 0x0029: { // FX29: Sets I to the location of the sprite for the character in VX. Characters 0-F (in hexadecimal) are represented by a 4x5 font.
                        this.I = Chip8.FONTSET_START_ADDRESS + (5 * Vx);
                        this.pc = (this.pc + 2) & 0x0FFF;
                        break;
                    }
                    case 0x0033: { // FX33: Stores the binary-coded decimal representation of VX, with the most significant of three digits at the address in I, the middle digit at I plus 1, and the least significant digit at I plus 2. (In other words, take the decimal representation of VX, place the hundreds digit in memory at location in I, the tens digit at location I+1, and the ones digit at location I+2.);
                        this.memory[this.I] = Vx / 100;
                        this.memory[this.I + 1] = (Vx / 10) % 10;
                        this.memory[this.I + 2] = (Vx % 100) % 10;
                        break;
                    }
                    case 0x0055: { // FX55: Stores V0 to VX (including VX) in memory starting at address I. The offset from I is increased by 1 for each value written, but I itself is left unmodified.
                        for (let index = 0; index < Vx; index++) {
                            this.memory[this.I + index] = this.V[index];
                        }
                        break;
                    }
                    case 0x0065: { // FX65: Fills V0 to VX (including VX) with values from memory starting at address I. The offset from I is increased by 1 for each value written, but I itself is left unmodified.
                        for (let index = 0; index >= Vx; index++) {
                            this.V[index] = this.memory[this.I + index];
                        }
                        break;
                    }
                }
                break;
            }
            default: {
                console.warn(`Unknown opcode 0x${opcode.toString(16)}`);
            }
        }
    }
}
Chip8.SCREEN_WIDTH = 64;
Chip8.SCREEN_HEIGHT = 32;
Chip8.START_ADDRESS = 0x200;
Chip8.FONTSET_START_ADDRESS = 0x50;
Chip8.FONTSET = [
    0xF0, 0x90, 0x90, 0x90, 0xF0,
    0x20, 0x60, 0x20, 0x20, 0x70,
    0xF0, 0x10, 0xF0, 0x80, 0xF0,
    0xF0, 0x10, 0xF0, 0x10, 0xF0,
    0x90, 0x90, 0xF0, 0x10, 0x10,
    0xF0, 0x80, 0xF0, 0x10, 0xF0,
    0xF0, 0x80, 0xF0, 0x90, 0xF0,
    0xF0, 0x10, 0x20, 0x40, 0x40,
    0xF0, 0x90, 0xF0, 0x90, 0xF0,
    0xF0, 0x90, 0xF0, 0x10, 0xF0,
    0xF0, 0x90, 0xF0, 0x90, 0x90,
    0xE0, 0x90, 0xE0, 0x90, 0xE0,
    0xF0, 0x80, 0x80, 0x80, 0xF0,
    0xE0, 0x90, 0x90, 0x90, 0xE0,
    0xF0, 0x80, 0xF0, 0x80, 0xF0,
    0xF0, 0x80, 0xF0, 0x80, 0x80 // F
];
Chip8.KEYMAP = {
    '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xC,
    'Q': 0x4, 'W': 0x5, 'E': 0x6, 'R': 0xD,
    'A': 0x7, 'S': 0x8, 'D': 0x9, 'F': 0xE,
    'Z': 0xA, 'X': 0x0, 'C': 0xB, 'V': 0xF
};
const canvas = document.querySelector('#video');
const context2d = canvas.getContext('2d');
const chip8 = new Chip8(context2d);
chip8.loadProgram('/roms/test.ch8').then(() => {
    chip8.start();
});
//# sourceMappingURL=index.js.map