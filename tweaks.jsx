// tweaks.jsx — direction switcher + accent + headline font for the coffee landing page
const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "clean",
  "accent": "#8a5232",
  "headFont": "Assistant"
}/*EDITMODE-END*/;

const DIRECTION_LABELS = {
  clean: "נקי לבן",
  warm: "נייר חם",
  gallery: "גלריה",
};

// each direction has its own native accent; switching direction resets accent to it
const DIRECTION_ACCENT = {
  clean: "#8a5232",
  warm: "#95542f",
  gallery: "#16120e",
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.setAttribute("data-direction", t.direction);
  }, [t.direction]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    // derive a soft tint from the accent
    document.documentElement.style.setProperty(
      "--accent-soft",
      `color-mix(in srgb, ${t.accent} 12%, var(--surface))`
    );
  }, [t.accent]);

  useEffect(() => {
    const stack =
      t.headFont === "Assistant"
        ? "'Assistant', system-ui, sans-serif"
        : `'${t.headFont}', Georgia, serif`;
    document.documentElement.style.setProperty("--font-head", stack);
  }, [t.headFont]);

  function pickDirection(dir) {
    setTweak({ direction: dir, accent: DIRECTION_ACCENT[dir] });
  }

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="כיוון עיצובי" />
      <TweakRadio
        label="סגנון"
        value={t.direction}
        options={[
          { value: "clean", label: "נקי לבן" },
          { value: "warm", label: "נייר חם" },
          { value: "gallery", label: "גלריה" },
        ]}
        onChange={pickDirection}
      />

      <TweakSection label="צבע" />
      <TweakColor
        label="גוון מוביל"
        value={t.accent}
        options={["#8a5232", "#95542f", "#16120e", "#3d5a4c", "#6f4636"]}
        onChange={(v) => setTweak("accent", v)}
      />

      <TweakSection label="טיפוגרפיה" />
      <TweakRadio
        label="גופן כותרות"
        value={t.headFont}
        options={[
          { value: "Frank Ruhl Libre", label: "פרנק" },
          { value: "Noto Serif Hebrew", label: "נוטו" },
          { value: "Assistant", label: "אסיסטנט" },
        ]}
        onChange={(v) => setTweak("headFont", v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<App />);
