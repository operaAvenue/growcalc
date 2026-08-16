import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import GrowinStones from "./growinstones.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("GrowinStones error caught:", error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
    } catch (e) {}
    window.location.href = window.location.pathname;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", background: "#ffffff", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", textAlign: "center" }}>
          <h2 style={{ color: "#e11d48", fontSize: 22, marginBottom: 12 }}>Ops! Algo deu errado ao carregar o aplicativo.</h2>
          <p style={{ color: "#475569", fontSize: 14, marginBottom: 20 }}>
            {this.state.error?.message || "Ocorreu um erro de renderização."}
          </p>
          <button
            onClick={this.handleReset}
            style={{ padding: "12px 24px", background: "#2563eb", color: "#ffffff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            🔄 Resetar Dados & Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GrowinStones />
    </ErrorBoundary>
  </React.StrictMode>
);
