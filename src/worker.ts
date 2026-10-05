import { chapterLevel } from "./content";
import { solve } from "./engine";
import { compactHintPath } from "./hints";
import { generate, mixVisible, type GenerationOptions } from "./generator";
import type { Board, Move, Profile } from "./engine";
type Request =
  | { id: number; kind: "level"; number: number }
  | { id: number; kind: "hint"; board: Board; path?: Move[] | null }
  | {
      id: number;
      kind: "generate";
      seed: string;
      profile: Profile;
      options: GenerationOptions;
    }
  | { id: number; kind: "mix"; board: Board; seed: string };
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const value =
      request.kind === "level"
        ? chapterLevel(request.number)
        : request.kind === "generate"
          ? generate(request.seed, request.profile, 1, request.options)
          : request.kind === "hint"
            ? hint(request.board, request.path)
            : mixVisible(request.board, request.seed);
    self.postMessage({ id: request.id, value });
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

function hint(board: Board, known?: Move[] | null) {
  if (known) {
    const path = compactHintPath(board, known);
    if (path) return { status: "solved", path, visited: 0 };
  }
  const result = solve(board, 30000, 72);
  if (result.path) result.path = compactHintPath(board, result.path);
  return result;
}
