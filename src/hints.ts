import { clone, type Board, type Move } from "./engine";
import { finishes } from "./storage";

const same = (a: Move[0], b: Move[0]) => a[0] === b[0] && a[1] === b[1];

// Shorten a proven route without changing generation or claiming a shortest path.
// Replaying the whole candidate preserves row reveals, shipments and lock timing.
export function compactHintPath(board: Board, path: Move[], maxChecks = 1000): Move[] | null {
  if (!finishes(board, path)) return null;
  let best = clone(path), checks = 0;
  search: while (checks < maxChecks) {
    for (let i = 0; i < best.length && checks < maxChecks; i++) {
      const candidate = best.filter((_, index) => index !== i);
      checks++;
      if (finishes(board, candidate)) {
        best = candidate;
        continue search;
      }
      const [from, to] = best[i];
      if (from[0] !== to[0] && checks < maxChecks) {
        // Keep a parked item in place when the rest of the route can use its
        // current shelf instead of an equivalent empty shelf.
        const remap = ([shelf, slot]: Move[0]): Move[0] => {
          if (shelf !== from[0] && shelf !== to[0]) return [shelf, slot];
          const other = shelf === from[0] ? to[0] : from[0];
          const mappedSlot = slot === from[1] ? to[1] : slot === to[1] ? from[1] : slot;
          return [other, mappedSlot];
        };
        const rebased: Move[] = best.slice(0, i).concat(
          best.slice(i + 1).map(([a, b]): Move => [remap(a), remap(b)]),
        );
        checks++;
        if (finishes(board, rebased)) {
          best = rebased;
          continue search;
        }
      }
    }
    for (let i = 0; i < best.length && checks < maxChecks; i++) {
      for (let j = i + 1; j < best.length && checks < maxChecks; j++) {
        if (!same(best[i][1], best[j][0])) continue;
        const candidate = clone(best);
        candidate.splice(j, 1);
        if (same(best[i][0], best[j][1])) candidate.splice(i, 1);
        else candidate[i] = [clone(best[i][0]), clone(best[j][1])];
        checks++;
        if (finishes(board, candidate)) {
          best = candidate;
          continue search;
        }
      }
    }
    break;
  }
  return best;
}
