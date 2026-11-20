/** A person in a photo with each garment outlined and named: what «Desde un look» does, at a glance. */
export default function LookIllustration() {
  return (
    <svg className="look-art" viewBox="0 0 260 300" role="presentation">
      <rect className="look-art-frame" x="46" y="8" width="168" height="284" rx="18" />
      {/* The person. */}
      <circle className="look-art-skin" cx="130" cy="54" r="17" />
      <rect className="look-art-skin" x="124" y="68" width="12" height="12" rx="4" />
      <path className="look-art-skin" d="M93 88 q-10 4 -12 24 l-4 40 q0 6 6 6 q5 0 6 -6 l6 -38 z" />
      <path className="look-art-skin" d="M167 88 q10 4 12 24 l4 40 q0 6 -6 6 q-5 0 -6 -6 l-6 -38 z" />
      <path className="look-art-top" d="M104 80 q26 -8 52 0 l14 8 l-6 22 l-8 -4 l0 46 l-52 0 l0 -46 l-8 4 l-6 -22 z" />
      <path className="look-art-bottom" d="M104 150 l52 0 l4 92 l-20 0 l-10 -70 l-10 70 l-20 0 z" />
      <path className="look-art-shoe" d="M98 242 l22 0 l2 10 q-1 6 -8 6 l-22 0 q-4 0 -3 -5 q2 -9 9 -11 z" />
      <path className="look-art-shoe" d="M162 242 l-22 0 l-2 10 q1 6 8 6 l22 0 q4 0 3 -5 q-2 -9 -9 -11 z" />
      {/* What Molt finds. */}
      <rect className="look-art-outline" x="84" y="72" width="92" height="84" rx="12" />
      <rect className="look-art-outline" x="96" y="146" width="68" height="94" rx="12" style={{ animationDelay: '-.6s' }} />
      <rect className="look-art-outline" x="82" y="236" width="96" height="28" rx="10" style={{ animationDelay: '-1.2s' }} />
      <g className="look-art-tag">
        <line x1="176" y1="96" x2="196" y2="96" />
        <rect x="190" y="84" width="66" height="24" rx="12" />
        <text x="223" y="100">Camiseta</text>
      </g>
      <g className="look-art-tag">
        <line x1="96" y1="196" x2="70" y2="196" />
        <rect x="4" y="184" width="70" height="24" rx="12" />
        <text x="39" y="200">Pantalón</text>
      </g>
      <g className="look-art-tag">
        <line x1="178" y1="250" x2="196" y2="250" />
        <rect x="190" y="238" width="66" height="24" rx="12" />
        <text x="223" y="254">Zapatillas</text>
      </g>
    </svg>
  )
}
