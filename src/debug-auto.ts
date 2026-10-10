import { applyMove, clone, initial, won, type Board, type Move, type SearchResult } from "./engine";
import { finishes, type Attempt } from "./storage";

export type DebugAutoStatus = "idle" | "checking" | "running";
export interface DebugAutoPorts {
  current(): Attempt | null;
  allowed(): boolean;
  move(move: Move): boolean;
  solve(board: Board, known: Move[] | null): Promise<SearchResult>;
  report(message: string): void;
  statusChanged?(status: DebugAutoStatus): void;
  timers?: { set(callback: () => void, delayMs: number): unknown; clear(handle: unknown): void };
}

/** Plays through the ordinary controller, never replaces its board or reward. */
export class DebugAutoPlayer {
  private generation = 0;
  private timer: unknown;
  private readonly timers: NonNullable<DebugAutoPorts["timers"]>;
  status: DebugAutoStatus = "idle";

  constructor(private readonly ports: DebugAutoPorts) {
    this.timers = ports.timers ?? {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }
  private setStatus(status: DebugAutoStatus) {
    if (this.status === status) return;
    this.status = status;
    this.ports.statusChanged?.(status);
  }
  cancel(): void {
    this.generation++;
    if (this.timer !== undefined) this.timers.clear(this.timer);
    this.timer = undefined;
    this.setStatus("idle");
  }
  async start(): Promise<boolean> {
    this.cancel();
    const attempt = this.ports.current();
    if (!attempt || !this.ports.allowed() || won(attempt.board)) return false;
    const generation = this.generation;
    const definition = JSON.stringify(attempt.definition);
    let expectedBoard = attempt.board;
    let expectedState = JSON.stringify(expectedBoard);
    const unchanged = () => generation === this.generation && this.ports.allowed() &&
      this.ports.current() === attempt && attempt.board === expectedBoard &&
      JSON.stringify(attempt.board) === expectedState && JSON.stringify(attempt.definition) === definition;
    this.setStatus("checking");
    try {
      let path: Move[] | null;
      if (expectedState === JSON.stringify(initial(attempt.definition))) {
        path = clone(attempt.definition.verifiedSolution);
      } else {
        const result = await this.ports.solve(clone(expectedBoard), attempt.solution ? clone(attempt.solution) : null);
        if (!unchanged()) return false;
        path = result.status === "solved" ? result.path : null;
        if (!path?.length) {
          this.cancel();
          this.ports.report(result.status === "unknown"
            ? "Поиск исчерпал лимит. Автопрохождение не запущено. Отмени ход или начни заново."
            : "Проверенный путь не найден. Отмени ход или начни заново.");
          return false;
        }
      }
      if (!unchanged()) return false;
      if (!path?.length || !finishes(expectedBoard, path)) {
        this.cancel();
        this.ports.report("Путь не прошёл проверку. Поле не изменено.");
        return false;
      }
      const moves = clone(path);
      const delay = Math.min(250, Math.max(45, Math.round(3000 / moves.length)));
      let index = 0;
      const tick = () => {
        this.timer = undefined;
        if (!unchanged()) { this.cancel(); return; }
        const move = moves[index];
        const predicted = applyMove(expectedBoard, ...move);
        if (!predicted || !this.ports.move(clone(move))) {
          this.cancel();
          this.ports.report("Автопрохождение остановлено: поле изменилось.");
          return;
        }
        // Ordinary victory UI can cancel this run while granting its reward.
        if (generation !== this.generation) return;
        if (this.ports.current() !== attempt || JSON.stringify(attempt.board) !== JSON.stringify(predicted)) {
          this.cancel();
          this.ports.report("Автопрохождение остановлено: поле изменилось.");
          return;
        }
        if (won(attempt.board)) { this.cancel(); return; }
        expectedBoard = attempt.board;
        expectedState = JSON.stringify(expectedBoard);
        index++;
        this.timer = this.timers.set(tick, delay);
      };
      this.setStatus("running");
      this.timer = this.timers.set(tick, delay);
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.cancel();
        this.ports.report(error instanceof Error ? error.message : "Не удалось проверить путь. Поле не изменено.");
      }
      return false;
    } finally {
      if (generation === this.generation && this.status === "checking") this.cancel();
    }
  }
}
