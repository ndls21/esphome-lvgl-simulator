// App entry — design canvas with 3 simulator-UI variations.
// Each artboard hosts a Variation wrapper that owns its own light/dark theme state.

function VariationFrame({ Component, defaultTheme = "light" }) {
  const [theme, setTheme] = React.useState(defaultTheme);
  return <Component theme={theme} onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />;
}

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="intro"
        title="CamperOS Simulator — Host UI Variations"
        subtitle="412×412 round preview · 36 pages · widget tree, inspector, drive panel · light + dark per variation"
      >
        <DCArtboard id="v1" label="V1 · Classic IDE — left rail, center preview, right inspector, bottom YAML" width={1440} height={840}>
          <VariationFrame Component={V1ClassicIDE} defaultTheme="light" />
        </DCArtboard>
        <DCArtboard id="v2" label="V2 · YAML-first split — YAML left, preview + drive stack right" width={1440} height={840}>
          <VariationFrame Component={V2YamlSplit} defaultTheme="dark" />
        </DCArtboard>
        <DCArtboard id="v3" label="V3 · Preview-centric — device hero, drawers from all 4 edges" width={1440} height={840}>
          <VariationFrame Component={V3PreviewCentric} defaultTheme="dark" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
