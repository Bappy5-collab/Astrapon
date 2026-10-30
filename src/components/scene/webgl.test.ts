import { describe, expect, it } from "vitest";

import { detectGraphicsCapability, isSoftwareRenderer } from "./webgl";

describe("isSoftwareRenderer", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
  ])("flags CPU rasterisers: %s", (name) => {
    expect(isSoftwareRenderer(name)).toBe(true);
  });

  it.each([
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple M2",
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ])("does not flag hardware GPUs: %s", (name) => {
    expect(isSoftwareRenderer(name)).toBe(false);
  });
});

describe("detectGraphicsCapability", () => {
  it("reports unavailable outside a browser", () => {
    expect(detectGraphicsCapability()).toEqual({ support: "unavailable", softwareRenderer: false });
  });
});
