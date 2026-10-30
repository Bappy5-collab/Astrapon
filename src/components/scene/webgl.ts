export type WebGLSupport = "webgl2" | "webgl" | "unavailable";

export type GraphicsCapability = {
  support: WebGLSupport;
  /**
   * True when WebGL is provided by a CPU rasteriser (SwiftShader, llvmpipe,
   * Microsoft Basic Render Driver), e.g. in VMs, remote desktops, or with GPU
   * acceleration disabled. Full-quality rendering can freeze the page there.
   */
  softwareRenderer: boolean;
};

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render|software/i;

export function isSoftwareRenderer(rendererName: string): boolean {
  return SOFTWARE_RENDERER.test(rendererName);
}

/** Probe for a usable WebGL context. Browser-only; returns "unavailable" on the server. */
export function detectGraphicsCapability(): GraphicsCapability {
  const none: GraphicsCapability = { support: "unavailable", softwareRenderer: false };
  if (typeof window === "undefined" || typeof document === "undefined") return none;
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 ?? canvas.getContext("webgl");
    if (!gl) return none;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { support: gl2 ? "webgl2" : "webgl", softwareRenderer: isSoftwareRenderer(renderer) };
  } catch {
    // Some privacy modes throw instead of returning null.
    return none;
  }
}
