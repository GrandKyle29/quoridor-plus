import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
  stack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("🚨 ERROR BOUNDARY:", error);
    console.error("🚨 Component stack:", errorInfo.componentStack);
    this.setState({ stack: errorInfo.componentStack || error.stack || null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            textAlign: "center",
            padding: "30px",
            color: "white",
            backgroundColor: "#8b0000",
            minHeight: "100vh",
            fontFamily: "monospace",
          }}
        >
          <h1 style={{ color: "white" }}>🚨 RENDER CRASH</h1>
          <p
            style={{
              color: "#ffcccc",
              maxWidth: "600px",
              margin: "20px auto",
              wordBreak: "break-word",
            }}
          >
            <strong>Error:</strong> {this.state.error?.message}
          </p>
          <pre
            style={{
              textAlign: "left",
              backgroundColor: "#1a0000",
              padding: "15px",
              borderRadius: "4px",
              maxWidth: "90vw",
              margin: "20px auto",
              fontSize: "11px",
              overflow: "auto",
              maxHeight: "400px",
              color: "#ffcccc",
            }}
          >
            {this.state.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              backgroundColor: "white",
              color: "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
