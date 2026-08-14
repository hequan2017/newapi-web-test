import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesPath = join(process.cwd(), 'src/styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function getHexVariable(name) {
  const match = styles.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  return match?.[1] || '';
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => {
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground, background = '#ffffff') {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('intelligent lab visual contracts', () => {
  it('keeps visible keyboard focus styles', () => {
    expect(styles).toContain('.tab-button.active:focus-visible');
    expect(styles).toContain('.workspace-nav-button.active:focus-visible');
    expect(styles).toMatch(/outline:\s*3px solid/);
  });

  it('disables non-essential motion when requested', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('transform: none !important');
  });

  it('keeps small text and active navigation colors above 4.5 contrast', () => {
    expect(contrastRatio(getHexVariable('--accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(getHexVariable('--accent-secondary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(getHexVariable('--action'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(getHexVariable('--text-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('defines an Apple-inspired palette with a manual dark theme', () => {
    expect(styles).toMatch(/--bg-page:\s*#f5f5f7/);
    expect(styles).toMatch(/--text-main:\s*#1d1d1f/);
    expect(styles).toMatch(/--action:\s*#0071e3/);
    expect(styles).toContain('--gradient-spectrum');
    expect(styles).toContain(":root[data-theme='dark']");
    expect(styles).toMatch(/:root\[data-theme='dark'\][\s\S]*color-scheme:\s*dark/);
    expect(styles).toMatch(/:root\[data-theme='dark'\] select\s*\{[\s\S]*fill='%23a1a1a6'/);
  });

  it('defines the command center layout surfaces', () => {
    expect(styles).toContain('.capability-rail');
    expect(styles).toContain('.runtime-overview');
    expect(styles).toContain('.command-grid');
    expect(styles).toContain('.output-monitor');
    expect(styles).toContain('.available-models');
    expect(styles).toContain('.topbar-control-group');
    expect(styles).toContain('.brand-signal svg');
    expect(styles).toContain('.rail-icon svg');
  });

  it('does not retain legacy layout selectors or duplicate responsive breakpoints', () => {
    expect(styles).not.toMatch(/(^|\n)\.layout\s*\{/);
    expect(styles).not.toMatch(/(^|\n)\.capability-tabs\s*\{/);
    expect(styles.match(/@media \(max-width: 900px\)/g)).toHaveLength(1);
    expect(styles.match(/@media \(max-width: 560px\)/g)).toHaveLength(1);
  });
});
