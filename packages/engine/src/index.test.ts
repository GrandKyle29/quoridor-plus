import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "./index";

describe("engine", () => {
  it("has a version", () => {
    expect(ENGINE_VERSION).toBe("0.0.1");
  });
});
