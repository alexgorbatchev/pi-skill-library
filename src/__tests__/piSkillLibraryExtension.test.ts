import { expect, test, describe } from "bun:test";
import assert from "node:assert";
import piSkillLibraryExtension from "../piSkillLibraryExtension.js";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ExtensionEventHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

describe("piSkillLibraryExtension", () => {
  test("triggers session_start successfully without throwing ReferenceError", async () => {
    const handlers: Record<string, ExtensionEventHandler> = {};

    const mockPi = {
      registerMessageRenderer: () => {},
      sendMessage: () => {},
      registerCommand: () => {},
      on: (event: string, handler: ExtensionEventHandler) => {
        handlers[event] = handler;
      },
      sendUserMessage: () => {},
    } as unknown as ExtensionAPI;

    // Initialize extension
    piSkillLibraryExtension(mockPi);

    const sessionStartHandler = handlers["session_start"];
    assert(sessionStartHandler !== undefined);

    const mockCtx = {
      cwd: process.cwd(),
      hasUI: true,
      isIdle: () => true,
    } as unknown as ExtensionContext;

    const mockEvent = {
      type: "session_start",
      reason: "startup",
    };

    let error: unknown = null;
    try {
      await sessionStartHandler(mockEvent, mockCtx);
    } catch (e) {
      error = e;
    }

    expect(error).toBeNull();
  });
});
