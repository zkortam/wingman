import { createHash } from "node:crypto";

import type { EmbeddingClient } from "@outcome/schema";

export class ReplayEmbeddingClient implements EmbeddingClient {
  embed(input: { texts: string[]; dimensions: 1536 }): Promise<number[][]> {
    return Promise.resolve(
      input.texts.map((text) => deterministicVector(text, input.dimensions)),
    );
  }
}

function deterministicVector(text: string, dimensions: number): number[] {
  const digest = createHash("sha256").update(text).digest();
  return Array.from(
    { length: dimensions },
    (_, index) => ((digest[index % digest.length] ?? 0) - 127.5) / 127.5,
  );
}
