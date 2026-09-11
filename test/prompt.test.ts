import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { discardPendingInput, releaseStdin } from "../src/prompt.js";

describe("discardPendingInput", () => {
  it("drains leftover bytes so a later reader sees an empty stream", async () => {
    const stdin = new PassThrough();
    stdin.write("\r\n");
    await discardPendingInput(stdin);
    assert.equal(stdin.read(), null);
  });
});

describe("releaseStdin", () => {
  it("pauses the stream and drops keypress listeners", () => {
    const stdin = new PassThrough();
    stdin.on("keypress", () => {});
    releaseStdin(stdin as unknown as NodeJS.ReadStream);
    assert.equal(stdin.listenerCount("keypress"), 0);
    assert.equal(stdin.isPaused(), true);
  });
});
