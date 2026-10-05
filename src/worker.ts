import { chapterLevel } from "./content";
import { solve } from "./engine";
import { generate, mixVisible, type GenerationOptions } from "./generator";
import type { Board, Profile } from "./engine";
type Request =
  | { id: number; kind: "level"; number: number }
  | { id: number; kind: "hint"; board: Board }
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
            ? solve(request.board, 30000, 72)
            : mixVisible(request.board, request.seed);
    self.postMessage({ id: request.id, value });
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
