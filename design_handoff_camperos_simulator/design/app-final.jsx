// Entry for the chosen design — renders V4Final on a viewport-fit stage.

function Stage({ children, w = 1440, h = 840 }) {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / w, window.innerHeight / h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [w, h]);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "grid", placeItems: "center", overflow: "hidden",
    }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "center center", flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

function FinalApp() {
  const [theme, setTheme] = React.useState("dark");
  return (
    <Stage>
      <V4Final theme={theme} onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
    </Stage>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<FinalApp />);
