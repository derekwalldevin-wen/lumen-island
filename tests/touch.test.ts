import { describe, expect, it } from 'vitest';
// CSS is read from disk: Vitest's pipeline intercepts `?raw` on .css and hands
// back an empty string. TypeScript sources come through `?raw` fine.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inputSource from '../src/core/input.ts?raw';
import uiSource from '../src/ui/ui.ts?raw';

/**
 * Touch layout and the dynamic joystick.
 *
 * Two things are easy to break here and impossible to notice without a phone:
 * the stick has to land under the finger, and the touch targets have to be big
 * enough and inside the frame. The browser harness cannot emulate a coarse
 * pointer reliably, so this asserts the source properties the live behaviour
 * depends on. The placement arithmetic itself was verified in a real browser
 * with synthetic pointer events at five different touch points.
 */

const UI_SOURCE: string = uiSource;
const CSS_SOURCE: string = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const INPUT_SOURCE: string = inputSource;

describe('touch move zone', () => {
  it('ships a move zone that claims the lower left quadrant', () => {
    // The old control required hitting a 122px circle. A zone means the thumb
    // lands wherever it lands and the stick appears under it.
    expect(UI_SOURCE).toContain('id="touch-move-zone"');
    expect(CSS_SOURCE).toMatch(/\.touch-move-zone\s*\{[^}]*position:\s*absolute/);
    expect(CSS_SOURCE).toMatch(/\.touch-move-zone\s*\{[^}]*touch-action:\s*none/);
    // Covering less than half the width would put the buttons under the thumb.
    const width = CSS_SOURCE.match(/\.touch-move-zone\s*\{[^}]*width:\s*(\d+)%/);
    expect(width, 'move zone width is not a percentage').not.toBeNull();
    expect(Number(width![1]), 'move zone is too narrow to use comfortably').toBeGreaterThanOrEqual(40);
  });

  it('binds the joystick to the zone, not only to the stick', () => {
    expect(INPUT_SOURCE).toContain('#touch-move-zone');
    expect(INPUT_SOURCE).toMatch(/surface\.addEventListener\('pointerdown', plant\)/);
  });

  it('plants the stick absolutely so repeated taps cannot drift', () => {
    // A relative stick offsets left/top from its static slot, and that error
    // compounds: measured at 25px off on the second tap and 90px on the third.
    expect(INPUT_SOURCE).toMatch(/joystick\.style\.position = 'absolute'/);
    // The position has to be set before the rect is measured, because going
    // absolute removes the stick from flow and moves it by its static offset.
    const positionAt = INPUT_SOURCE.indexOf("joystick.style.position = 'absolute'");
    const rectAt = INPUT_SOURCE.indexOf('joystick.getBoundingClientRect()', positionAt);
    const leftAt = INPUT_SOURCE.indexOf('joystick.style.left', positionAt);
    expect(positionAt, 'stick is never made absolute').toBeGreaterThan(-1);
    expect(rectAt, 'the stick rect is never measured after going absolute').toBeGreaterThan(positionAt);
    expect(leftAt).toBeGreaterThan(rectAt);
  });

  it('subtracts the offset parent origin before placing the stick', () => {
    // left/top are relative to the offset parent, not the viewport.
    expect(INPUT_SOURCE).toContain('joystick.offsetParent');
    expect(INPUT_SOURCE).toMatch(/hostRect\s*\?\s*hostRect\.left\s*:\s*0/);
  });

  it('restores the static placement when the stick parks', () => {
    expect(INPUT_SOURCE).toMatch(/joystick\.style\.position = ''/);
    expect(INPUT_SOURCE).toMatch(/joystick\.style\.left = ''/);
  });

  it('clears any pending park timer on a new touch', () => {
    // Otherwise a park scheduled by the previous release fires mid-grab and
    // yanks the stick out from under the finger.
    expect(INPUT_SOURCE).toMatch(/clearTimeout\(this\.joystickParkTimer\)/);
  });

  it('ignores pointers it is not tracking', () => {
    // A second finger landing on the zone must not steal the stick.
    expect(INPUT_SOURCE).toMatch(/if \(event\.pointerId !== this\.joystickPointer\) return/);
  });

  it('detaches every listener it added', () => {
    const removals = (INPUT_SOURCE.match(/removeEventListener\(/g) ?? []).length;
    const additions = (INPUT_SOURCE.match(/addEventListener\('pointer/g) ?? []).length;
    expect(removals, 'a pointer listener is added without a matching removal').toBeGreaterThanOrEqual(additions);
  });
});

describe('touch targets', () => {
  /** Body of the first rule whose selector list mentions `selector`. */
  function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = CSS_SOURCE.match(new RegExp(`^[^{}]*${escaped}[^{}]*\\{([^}]*)\\}`, 'm'));
    return match ? match[1] ?? '' : '';
  }

  function px(rule: string, property: string): number {
    return Number(rule.match(new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1] ?? 0);
  }

  it('gives every touch button at least a 44px target', () => {
    // Apple HIG and WCAG 2.5.5 both put the floor at 44px.
    const base = ruleBody('.touch-button');
    expect(base, 'no .touch-button rule found').not.toBe('');
    expect(px(base, 'width'), 'touch button width').toBeGreaterThanOrEqual(44);
    expect(px(base, 'height'), 'touch button height').toBeGreaterThanOrEqual(44);
  });

  it('keeps a large attack target, since it is pressed most often', () => {
    const attack = ruleBody('.touch-button--attack');
    expect(attack, 'no .touch-button--attack rule found').not.toBe('');
    expect(px(attack, 'width'), 'attack target width').toBeGreaterThanOrEqual(44);
    expect(px(attack, 'height'), 'attack target height').toBeGreaterThanOrEqual(44);
  });

  it('disables browser gestures on every touch surface', () => {
    // Without touch-action: none the browser eats the drag for scrolling and the
    // joystick never tracks the finger.
    expect(ruleBody('.touch-move-zone')).toMatch(/touch-action:\s*none/);
    expect(ruleBody('.touch-button')).toMatch(/touch-action:\s*none/);
    expect(ruleBody('.joystick')).toMatch(/touch-action:\s*none/);
  });

  it('keeps the interact button reachable and only shown when ready', () => {
    // The button is hidden by default and revealed near a trigger, so the
    // player is not offered an action that does nothing.
    expect(ruleBody('.touch-button--interact')).toMatch(/display:\s*none/);
    expect(CSS_SOURCE).toMatch(/\.touch-button--interact\[data-ready="true"\]\s*\{\s*display:\s*inline-flex/);
  });

  it('hides the keyboard hint on touch devices', () => {
    // The key bar is meaningless without a keyboard and sits where the buttons go.
    // The media block nests several rules, so take it up to the next at-rule.
    const start = CSS_SOURCE.indexOf('@media (pointer: coarse)');
    expect(start, 'no coarse pointer media query').toBeGreaterThan(-1);
    const rest = CSS_SOURCE.slice(start + 1);
    const next = rest.search(/\n\s*@/);
    const block = rest.slice(0, next > 0 ? next : undefined);
    expect(block).toMatch(/\.desktop-hint\s*\{\s*display:\s*none/);
  });

  it('gives the touch buttons their own labelled commands', () => {
    for (const command of ['attack', 'dodge', 'skill', 'potion', 'interact']) {
      expect(UI_SOURCE, `no touch control for ${command}`).toContain(`data-command="${command}"`);
    }
  });
});