/** Pure geometry helpers for turning landmark connection lists into ordered paths. */

export interface Connection {
  start: number;
  end: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Paths {
  /** Closed loops (first index is not repeated at the end). */
  closed: number[][];
  /** Open chains, ordered from one end to the other. */
  open: number[][];
}

/** Convert an unordered list of edges into ordered closed loops and open chains. */
export function connectionsToPaths(connections: readonly Connection[]): Paths {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    let list = adj.get(a);
    if (!list) adj.set(a, (list = []));
    list.push(b);
  };
  for (const { start, end } of connections) {
    link(start, end);
    link(end, start);
  }
  const used = new Set<string>();
  const key = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const walk = (from: number): number[] => {
    const path = [from];
    let cur = from;
    for (;;) {
      const next = (adj.get(cur) ?? []).find((n) => !used.has(key(cur, n)));
      if (next === undefined) break;
      used.add(key(cur, next));
      path.push(next);
      cur = next;
    }
    return path;
  };

  const open: number[][] = [];
  for (const [node, ns] of adj) {
    if (ns.length !== 1) continue;
    const only = ns[0] as number;
    if (used.has(key(node, only))) continue;
    open.push(walk(node));
  }

  const closed: number[][] = [];
  for (const [node, ns] of adj) {
    for (const n of ns) {
      if (used.has(key(node, n))) continue;
      const loop = walk(node);
      if (loop.length > 1 && loop[0] === loop[loop.length - 1]) loop.pop();
      closed.push(loop);
    }
  }
  return { closed, open };
}

/** Signed polygon area (shoelace). Positive = counter-clockwise in y-up space. */
export function polygonArea(pts: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const p = pts[i] as Vec2;
    const q = pts[j] as Vec2;
    a += (q.x + p.x) * (q.y - p.y);
  }
  return a / 2;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function centroid(pts: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
}

/**
 * Smooth a closed loop with a centripetal Catmull-Rom spline through its points, adding
 * `subdivisions` points per segment. Turns MediaPipe's 20-point lip outline into a natural
 * curve instead of visible straight segments. Centripetal parameterisation avoids loops
 * and overshoot at sharp corners (mouth corners) and on very short segments.
 */
export function smoothClosed(pts: readonly Vec2[], subdivisions: number): Vec2[] {
  const n = pts.length;
  if (n < 3 || subdivisions < 1) return [...pts];
  const out: Vec2[] = [];
  const at = (i: number): Vec2 => pts[((i % n) + n) % n] as Vec2;
  const knot = (a: Vec2, b: Vec2): number => Math.max(1e-6, Math.sqrt(dist(a, b)));
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    out.push(p1);
    for (let s = 1; s <= subdivisions; s++) {
      const t = t1 + ((t2 - t1) * s) / (subdivisions + 1);
      const a1 = lerpT(p0, p1, 0, t1, t);
      const a2 = lerpT(p1, p2, t1, t2, t);
      const a3 = lerpT(p2, p3, t2, t3, t);
      const b1 = lerpT(a1, a2, 0, t2, t);
      const b2 = lerpT(a2, a3, t1, t3, t);
      out.push(lerpT(b1, b2, t1, t2, t));
    }
  }
  return out;
}

function lerpT(a: Vec2, b: Vec2, ta: number, tb: number, t: number): Vec2 {
  const d = tb - ta;
  if (Math.abs(d) < 1e-9) return { x: a.x, y: a.y };
  const u = (t - ta) / d;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * Join two roughly parallel open chains (e.g. upper and lower brow edge) into one polygon,
 * choosing the orientation that does not self-intersect.
 */
export function joinChains(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const aEnd = a[a.length - 1];
  const bStart = b[0];
  const bEnd = b[b.length - 1];
  if (!aEnd || !bStart || !bEnd) return [...a, ...b];
  return dist(aEnd, bEnd) < dist(aEnd, bStart) ? [...a, ...[...b].reverse()] : [...a, ...b];
}
