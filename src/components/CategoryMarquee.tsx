/* Infinite footer marquee — Igire Rwanda content only */
const PHRASES = [
  "Igire Rwanda Organization",
  "Empowering Communities",
  "Skills · Education · Growth",
  "Kigali · Rwanda",
  "Together We Rise",
  "SheCanCODE · AWE · Bootcamps",
];

const COLORS = ["#f59300", "#a9d4a0", "#d4b458", "#ffffff", "#e2603a", "#7cc35a"];

export default function CategoryMarquee() {
  return (
    <div className="overflow-hidden border-y border-line bg-panel py-4">
      <div className="marquee-track flex w-max whitespace-nowrap">
        {[0, 1].map((copy) => (
          <span key={copy} aria-hidden={copy === 1} className="flex items-center">
            {PHRASES.map((phrase, i) => (
              <span key={phrase} className="flex items-center">
                <span
                  className="display mx-8 text-2xl uppercase sm:text-3xl"
                  style={{ color: COLORS[i % COLORS.length] }}
                >
                  {phrase}
                </span>
                <span className="text-xl text-orange">✶</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
