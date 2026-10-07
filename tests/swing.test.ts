import { describe, expect, it } from 'vitest';
import { SWING_DURATION } from '../src/data';
import { swingPose } from '../src/render/visuals';

/**
 * The hero's swing.
 *
 * The character art is a single painted still, so the whole attack animation is
 * a transform of that one image. That makes the curve the animation: if the
 * shape of the motion is wrong, the attack reads as a twitch or a slide no
 * matter how good the arc looks. These tests pin the properties that make it
 * read as a blow rather than a drift.
 */

const IDLE = { lunge: 0, twist: 0, squash: 0, trailFrom: null, trailTo: null, trailAlpha: 0 };

/** Samples the curve densely enough to miss a spike between two steps. */
function sample(step: number, from = 0, to = 1, steps = 200): ReturnType<typeof swingPose>[] {
  const poses: ReturnType<typeof swingPose>[] = [];
  for (let index = 0; index <= steps; index += 1) {
    poses.push(swingPose(from + ((to - from) * index) / steps, step));
  }
  return poses;
}

describe('swing idle state', () => {
  it('is completely still when not swinging', () => {
    expect(swingPose(0, 0)).toEqual(IDLE);
  });

  it('is completely still once the swing has finished', () => {
    // Exactly 1 rather than just under: a pose that never quite returns to zero
    // leaves the hero permanently offset by a pixel or two after every blow.
    expect(swingPose(1, 0)).toEqual(IDLE);
    expect(swingPose(1.4, 0)).toEqual(IDLE);
  });

  it('treats negative and non-finite progress as idle rather than exploding', () => {
    // A progress value that goes negative would otherwise produce a pose with
    // the wind-up extrapolated backwards, throwing the hero off the arena.
    expect(swingPose(-0.5, 0)).toEqual(IDLE);
    expect(swingPose(Number.NaN, 0)).toEqual(IDLE);
  });
});

describe('swing motion shape', () => {
  it('winds up backwards before it strikes forwards', () => {
    // The wind-up is what gives the strike weight. Without a backward phase the
    // hero only ever moves towards the target and the blow has no anticipation.
    const windup = swingPose(0.12, 0);
    expect(windup.lunge, 'no backward wind-up').toBeLessThan(0);
  });

  it('reaches further forward than it winds back', () => {
    const poses = sample(0);
    const deepestBack = Math.min(...poses.map((pose) => pose.lunge));
    const furthestForward = Math.max(...poses.map((pose) => pose.lunge));
    expect(furthestForward, 'the strike does not travel past the wind-up').toBeGreaterThan(
      Math.abs(deepestBack) * 2,
    );
  });

  it('squashes at the moment of impact and nowhere else', () => {
    const poses = sample(0);
    const peak = poses.reduce((best, pose) => (pose.squash > best.squash ? pose : best), poses[0]!);
    expect(peak.squash, 'the swing never compresses the figure').toBeGreaterThan(0.03);
    // Wind-up should be a stretch, not a squash: the body coils open.
    expect(swingPose(0.1, 0).squash).toBeLessThanOrEqual(0);
  });

  it('twists one way on the way out and the other on the way back', () => {
    // A twist that never reverses reads as the whole figure rotating rather
    // than as a body pivoting through a blow and stopping.
    const windup = swingPose(0.14, 0);
    const impact = swingPose(0.36, 0);
    expect(Math.sign(windup.twist)).toBe(-Math.sign(impact.twist));
    expect(Math.sign(impact.twist)).not.toBe(0);
  });

  it('overshoots past neutral before settling, rather than stopping dead', () => {
    // Without a small overshoot the hero visibly halts at the end of every
    // blow, which reads as the animation being cut off.
    const settled = sample(0).filter((pose) => pose.lunge > 0.05);
    expect(settled.length, 'the hero never comes back past its start').toBeGreaterThan(2);
  });

  it('never moves so far that the hero leaves its own shadow', () => {
    // The lunge is applied to the sprite but the contact shadow is drawn at the
    // resting position, so a lunge much past the shadow radius would read as the
    // figure floating away from its own feet.
    for (const step of [0, 1, 2]) {
      for (const pose of sample(step)) {
        expect(Math.abs(pose.lunge), `step ${step} lunged ${pose.lunge}px`).toBeLessThan(30);
      }
    }
  });

  it('stays inside a believable twist for every combo step', () => {
    for (const step of [0, 1, 2]) {
      for (const pose of sample(step)) {
        expect(Math.abs(pose.twist), `step ${step} twisted ${pose.twist}rad`).toBeLessThan(0.5);
      }
    }
  });
});

describe('weapon arc', () => {
  it('is absent during the wind-up, then sweeps forward', () => {
    expect(swingPose(0.1, 0).trailAlpha, 'a trail during the wind-up').toBe(0);
    expect(swingPose(0.1, 0).trailFrom).toBeNull();
    const mid = swingPose(0.34, 0);
    expect(mid.trailAlpha, 'no trail while the blade is moving').toBeGreaterThan(0);
  });

  it('sweeps in one direction only', () => {
    // A trail that reverses mid-swing looks like the weapon bounced off something.
    const sweeping = sample(0).filter((pose) => pose.trailFrom !== null);
    expect(sweeping.length).toBeGreaterThan(4);
    const first = sweeping[0]!;
    for (const pose of sweeping) {
      const from = pose.trailFrom!;
      const to = pose.trailTo!;
      expect(Math.sign(to - from), 'the arc reversed direction').toBe(Math.sign(first.trailTo! - first.trailFrom!));
    }
  });

  it('sweeps across a visible angle, not a token wobble', () => {
    const poses = sample(0).filter((pose) => pose.trailFrom !== null && pose.trailTo !== null);
    const widest = poses.reduce(
      (best, pose) => Math.max(best, Math.abs(pose.trailTo! - pose.trailFrom!)),
      0,
    );
    expect(widest, 'the arc is too small to read as a swing').toBeGreaterThan(1);
  });

  it('fades to nothing rather than being cut off mid-stroke', () => {
    const fading = sample(0).filter((pose) => pose.trailAlpha > 0);
    const last = fading[fading.length - 1]!;
    expect(last.trailAlpha, 'the trail is still bright when it disappears').toBeLessThan(0.2);
  });

  it('never draws a trail at negative opacity', () => {
    // A negative alpha throws in some browsers and silently no-ops in others.
    for (const step of [0, 1, 2, 3, 4, 5]) {
      for (const pose of sample(step, -0.2, 1.2)) {
        expect(pose.trailAlpha).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the three hit combo reads as three different blows', () => {
  it('gives each step a different arc', () => {
    const arcs = [0, 1, 2].map((step) => {
      const poses = sample(step).filter((pose) => pose.trailFrom !== null);
      const peak = poses.reduce(
        (best, pose) => (Math.abs(pose.trailTo! - pose.trailFrom!) > Math.abs(best.trailTo! - best.trailFrom!) ? pose : best),
        poses[0]!,
      );
      return { from: peak.trailFrom!, to: peak.trailTo! };
    });
    // If two steps swept the same way the combo would read as one repeated poke.
    for (let a = 0; a < arcs.length; a += 1) {
      for (let b = a + 1; b < arcs.length; b += 1) {
        const same = Math.abs(arcs[a]!.from - arcs[b]!.from) < 0.2 && Math.abs(arcs[a]!.to - arcs[b]!.to) < 0.2;
        expect(same, `combo steps ${a} and ${b} sweep identically`).toBe(false);
      }
    }
  });

  it('swings in opposite directions on alternating steps', () => {
    const direction = (step: number) => {
      const poses = sample(step).filter((pose) => pose.trailFrom !== null);
      const peak = poses[Math.floor(poses.length / 2)]!;
      return Math.sign(peak.trailTo! - peak.trailFrom!);
    };
    expect(direction(0), 'step 0').not.toBe(direction(1));
  });

  it('wraps the combo so a held attack cycles instead of clamping', () => {
    // The combo counter is taken modulo 3 in the runtime. If the pose lookup did
    // not wrap, step 3 would fall off the end of the arc table.
    expect(swingPose(0.4, 3)).toEqual(swingPose(0.4, 0));
    expect(swingPose(0.4, 4)).toEqual(swingPose(0.4, 1));
    expect(swingPose(0.4, -1)).toEqual(swingPose(0.4, 2));
  });
});

describe('swing duration', () => {
  it('is long enough to read as a motion', () => {
    // Below about a fifth of a second the whole wind-up-strike-settle shape
    // happens inside two frames and reads as a jitter.
    expect(SWING_DURATION).toBeGreaterThan(0.2);
  });

  it('is short enough to finish before the quickest attack can restart', () => {
    // At the fastest weapon the cooldown is cooldown/speed. The swing has to fit
    // inside that or a held attack button leaves the hero permanently mid-recovery
    // and the strike phase is never seen.
    const fastestCooldown = 0.62;
    expect(SWING_DURATION).toBeLessThan(fastestCooldown);
  });
});