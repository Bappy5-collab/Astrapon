"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { fallback: (error: Error) => ReactNode; children: ReactNode };
type State = { error: Error | null };

/** Contains 3D runtime failures (context creation, shader compile, lost context) so the rest of the page keeps working. */
export class SceneErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[FieldShift scene]", error.message, info.componentStack);
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
