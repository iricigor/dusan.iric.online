'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function checkBranding({ evaluate, subject }) {
    const faviconMetrics = await evaluate(`(async () => {
        const image = new Image();
        image.src = document.querySelector('link[rel="icon"]').href;
        await image.decode();
        return [16, 32].map(size => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, size, size);
            const pixels = context.getImageData(0, 0, size, size).data;
            const blue = [], black = [];
            let pale = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) pale++;
                const point = { x: (i / 4) % size, y: Math.floor(i / 4 / size) };
                if (pixels[i + 2] > pixels[i] + 40 && pixels[i + 3] > 200) blue.push(point);
                const channels = [pixels[i], pixels[i + 1], pixels[i + 2]];
                if (Math.max(...channels) < 200 && Math.max(...channels) - Math.min(...channels) < 12 && pixels[i + 3] > 200) black.push(point);
            }
            const bounds = points => ({
                left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
                top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))
            });
            const counterIndex = (Math.floor(size * 19 / 32) * size + Math.floor(size * 17 / 32)) * 4;
            return {
                size, pale, blueCount: blue.length, blackCount: black.length,
                blue: bounds(blue), black: bounds(black),
                counter: [...pixels.slice(counterIndex, counterIndex + 4)]
            };
        });
    })()`);
    if (process.env.TUTOR_SCREENSHOT_DIRECTORY) {
        const preview = await evaluate(`(async () => {
            const image = new Image();
            image.src = document.querySelector('link[rel="icon"]').href;
            await image.decode();
            const preview = document.createElement('canvas');
            preview.width = 256; preview.height = 128;
            const context = preview.getContext('2d');
            context.imageSmoothingEnabled = false;
            [16, 32].forEach((size, index) => {
                const icon = document.createElement('canvas');
                icon.width = icon.height = size;
                icon.getContext('2d').drawImage(image, 0, 0, size, size);
                context.drawImage(icon, index * 128, 0, 128, 128);
            });
            return preview.toDataURL('image/png').split(',')[1];
        })()`);
        fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, 'favicon-16-32-enlarged.png'), Buffer.from(preview, 'base64'));
    }
    for (const { size, pale, blueCount, blackCount, blue, black, counter } of faviconMetrics) {
        assert.ok(pale > size * size / 3 && blueCount > size && blackCount > size / 4,
            `${subject}/${size}: visible pale tile, blue D and black cap`);
        assert.ok(blueCount > blackCount && blue.right - blue.left >= black.right - black.left &&
            blue.bottom - blue.top > black.bottom - black.top,
            `${subject}/${size}: D dominates cap in area and height: ${JSON.stringify({ blue, black, blueCount, blackCount })}`);
        assert.ok(black.left < blue.left && black.bottom >= blue.top,
            `${subject}/${size}: cap hangs over D's left edge: ${JSON.stringify({ blue, black })}`);
        assert.equal(black.top, 0, `${subject}/${size}: cap reaches the first pixel row`);
        assert.equal(blue.bottom, size - 1, `${subject}/${size}: D reaches the last pixel row`);
        assert.ok(counter.slice(0, 3).every(channel => channel > 220) && counter[3] > 200,
            `${subject}/${size}: D counter remains open: ${JSON.stringify(counter)}`);
    }
}

module.exports = { checkBranding };
