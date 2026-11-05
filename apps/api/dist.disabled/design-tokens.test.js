import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const root = resolve(import.meta.dirname, '../../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const tokens = JSON.parse(read('docs/design/irp-design-tokens.json'));
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const surfaces = {
    web: 'apps/api/src/dashboard.ts',
    linux: 'packages/linux-client/src/local-dashboard.ts',
    macos: 'packages/macos-client/src/local-dashboard.ts',
    android: 'clients/android/app/src/main/java/com/nahiradev/irp/ui/IrpTheme.kt',
    ios: 'clients/ios/Sources/IRPiOSClient/UI/IRPTheme.swift',
};
describe('IRP design tokens', () => {
    for (const [name, file] of Object.entries(surfaces)) {
        it(`${name} uses every token colour`, () => {
            const src = read(file).toLowerCase();
            for (const mode of ['dark', 'light']) {
                for (const [token, hex] of Object.entries(tokens.color[mode])) {
                    expect(src, `${file} ${mode}.${token} ${hex}`).toContain(hex.slice(1).toLowerCase());
                }
            }
        });
    }
    it('meets WCAG AA for every declared foreground/background pair', () => {
        const pairs = tokens.contrastPairs;
        expect(pairs).toBeDefined();
        for (const mode of ['dark', 'light']) {
            for (const fg of pairs.foreground) {
                for (const bg of pairs.background) {
                    const ratio = contrast(tokens.color[mode][fg], tokens.color[mode][bg]);
                    expect(ratio, `${mode} ${fg} on ${bg}`).toBeGreaterThanOrEqual(pairs.minimumRatio);
                }
            }
        }
    });
});
//# sourceMappingURL=design-tokens.test.js.map