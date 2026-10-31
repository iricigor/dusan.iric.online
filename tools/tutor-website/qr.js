'use strict';

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC_CODEWORDS_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const NUM_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const ALIGNMENT_CENTERS = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

function multiply(x, y) {
    let result = 0;
    for (let bit = 7; bit >= 0; bit--) {
        result = (result << 1) ^ ((result >>> 7) * 0x11d);
        result ^= ((y >>> bit) & 1) * x;
    }
    return result;
}

function divisor(degree) {
    let result = [1];
    let root = 1;
    for (let i = 0; i < degree; i++) {
        const next = Array(result.length + 1).fill(0);
        for (let j = 0; j < result.length; j++) {
            next[j] ^= result[j];
            next[j + 1] ^= multiply(result[j], root);
        }
        result = next;
        root = multiply(root, 2);
    }
    return result;
}

function reedSolomonRemainder(data, degree) {
    const generator = divisor(degree);
    const result = Array(degree).fill(0);
    for (const byte of data) {
        const factor = byte ^ result.shift();
        result.push(0);
        for (let i = 0; i < degree; i++) result[i] ^= multiply(generator[i + 1], factor);
    }
    return result;
}

function dataCodewords(bytes, version) {
    const blockCount = NUM_BLOCKS[version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[version];
    const dataLength = TOTAL_CODEWORDS[version] - blockCount * eccLength;
    const countBits = version < 10 ? 8 : 16;
    if (bytes.length >= 2 ** countBits) throw new Error('QR code URL is too long');
    const bits = [];
    const append = (value, length) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    append(4, 4);
    append(bytes.length, countBits);
    for (const byte of bytes) append(byte, 8);
    for (let i = 0; i < Math.min(4, dataLength * 8 - bits.length); i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
        result.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
    }
    for (let pad = 0xec; result.length < dataLength; pad ^= 0xec ^ 0x11) result.push(pad);

    const shortLength = Math.floor(dataLength / blockCount);
    const longBlocks = dataLength % blockCount;
    const blocks = [];
    let offset = 0;
    for (let i = 0; i < blockCount; i++) {
        const length = shortLength + (i >= blockCount - longBlocks ? 1 : 0);
        const data = result.slice(offset, offset + length);
        offset += length;
        blocks.push({ data, ecc: reedSolomonRemainder(data, eccLength) });
    }
    const interleaved = [];
    for (let i = 0; i <= shortLength; i++) {
        for (const block of blocks) if (i < block.data.length) interleaved.push(block.data[i]);
    }
    for (let i = 0; i < eccLength; i++) {
        for (const block of blocks) interleaved.push(block.ecc[i]);
    }
    return interleaved;
}

function formatBits(mask) {
    const data = (1 << 3) | mask;
    let remainder = data << 10;
    for (let bit = 14; bit >= 10; bit--) {
        if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
    }
    return ((data << 10) | remainder) ^ 0x5412;
}

function versionBits(version) {
    let remainder = version << 12;
    for (let bit = 17; bit >= 12; bit--) {
        if ((remainder >>> bit) & 1) remainder ^= 0x1f25 << (bit - 12);
    }
    return (version << 12) | remainder;
}

function masked(mask, row, column) {
    switch (mask) {
        case 0: return (row + column) % 2 === 0;
        case 1: return row % 2 === 0;
        case 2: return column % 3 === 0;
        case 3: return (row + column) % 3 === 0;
        case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
        case 5: return (row * column) % 2 + (row * column) % 3 === 0;
        case 6: return ((row * column) % 2 + (row * column) % 3) % 2 === 0;
        default: return ((row + column) % 2 + (row * column) % 3) % 2 === 0;
    }
}

function matrixFor(codewords, version, mask) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));
    const functionModules = Array.from({ length: size }, () => Array(size).fill(false));
    const setFunction = (row, column, value) => {
        matrix[row][column] = value;
        functionModules[row][column] = true;
    };
    const finder = (centerRow, centerColumn) => {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const row = centerRow + dy;
                const column = centerColumn + dx;
                if (row >= 0 && row < size && column >= 0 && column < size) {
                    const distance = Math.max(Math.abs(dx), Math.abs(dy));
                    setFunction(row, column, distance !== 2 && distance !== 4);
                }
            }
        }
    };
    const alignment = (centerRow, centerColumn) => {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                setFunction(centerRow + dy, centerColumn + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    };

    finder(3, 3);
    finder(3, size - 4);
    finder(size - 4, 3);
    for (let i = 8; i < size - 8; i++) {
        if (!functionModules[6][i]) setFunction(6, i, i % 2 === 0);
        if (!functionModules[i][6]) setFunction(i, 6, i % 2 === 0);
    }
    for (const row of ALIGNMENT_CENTERS[version]) {
        for (const column of ALIGNMENT_CENTERS[version]) {
            const overlapsFinder = [[3, 3], [3, size - 4], [size - 4, 3]]
                .some(([centerRow, centerColumn]) =>
                    Math.max(Math.abs(row - centerRow), Math.abs(column - centerColumn)) <= 4);
            if (!overlapsFinder) alignment(row, column);
        }
    }
    for (let i = 0; i < 15; i++) {
        const bit = ((formatBits(mask) >>> i) & 1) !== 0;
        const first = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i];
        const second = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
        setFunction(first[0], first[1], bit);
        setFunction(second[0], second[1], bit);
    }
    setFunction(size - 8, 8, true);
    if (version >= 7) {
        const bits = versionBits(version);
        for (let i = 0; i < 18; i++) {
            const bit = ((bits >>> i) & 1) !== 0;
            const row = Math.floor(i / 3);
            const column = size - 11 + i % 3;
            setFunction(row, column, bit);
            setFunction(column, row, bit);
        }
    }
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            const row = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
            for (let offset = 0; offset < 2; offset++) {
                const column = right - offset;
                if (!functionModules[row][column]) {
                    const codeword = codewords[Math.floor(bitIndex / 8)] || 0;
                    const bit = ((codeword >>> (7 - (bitIndex % 8))) & 1) !== 0;
                    matrix[row][column] = bit !== masked(mask, row, column);
                    bitIndex++;
                }
            }
        }
    }
    return matrix;
}

function penalty(matrix) {
    const size = matrix.length;
    let score = 0;
    const lines = [...matrix, ...matrix[0].map((_, column) => matrix.map(row => row[column]))];
    for (const line of lines) {
        for (let i = 0; i < size;) {
            let end = i + 1;
            while (end < size && line[end] === line[i]) end++;
            const runLength = end - i;
            if (runLength >= 5) score += runLength - 2;
            i = end;
        }
        for (let i = 0; i <= size - 11; i++) {
            const pattern = line.slice(i, i + 11).map(value => value ? '1' : '0').join('');
            if (pattern === '00001011101' || pattern === '10111010000') score += 40;
        }
    }
    for (let row = 0; row < size - 1; row++) {
        for (let column = 0; column < size - 1; column++) {
            const value = matrix[row][column];
            if (matrix[row][column + 1] === value && matrix[row + 1][column] === value &&
                matrix[row + 1][column + 1] === value) score += 3;
        }
    }
    const dark = matrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
}

function createQrSvg(text) {
    const bytes = Buffer.from(text, 'utf8');
    const version = Array.from({ length: 10 }, (_, index) => index + 1)
        .find(candidate => 4 + (candidate < 10 ? 8 : 16) + bytes.length * 8 <=
            (TOTAL_CODEWORDS[candidate] - NUM_BLOCKS[candidate] * ECC_CODEWORDS_PER_BLOCK[candidate]) * 8);
    if (!version) throw new Error('QR code URL is too long');
    const codewords = dataCodewords(bytes, version);
    let best;
    for (let mask = 0; mask < 8; mask++) {
        const matrix = matrixFor(codewords, version, mask);
        const score = penalty(matrix);
        if (!best || score < best.score) best = { matrix, score };
    }
    const quiet = 4;
    const viewSize = best.matrix.length + quiet * 2;
    let path = '';
    best.matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${viewSize}v${viewSize}H0z"/><path fill="#000" d="${path}"/></svg>`;
}

module.exports = { createQrSvg };
