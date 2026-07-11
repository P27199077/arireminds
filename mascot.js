/**
 * mascot.js
 * Renders and controls the fallback animated SVG mascot ("Ari")
 * with premium CSS micro-animations corresponding to reminder states.
 */

const Mascot = {
  // SVG Template containing styles, definitions, and paths
  getSVGMarkup(state = 'idle') {
    return `
    <svg id="mascot-svg" class="mascot-avatar state-${state}" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradients -->
        <linearGradient id="hair-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8a2be2" />
          <stop offset="50%" stop-color="#da70d6" />
          <stop offset="100%" stop-color="#ff007f" />
        </linearGradient>
        <linearGradient id="face-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fff8f6" />
          <stop offset="100%" stop-color="#ffeedd" />
        </linearGradient>
        <linearGradient id="hoodie-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b" />
          <stop offset="100%" stop-color="#4f46e5" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <!-- Dynamic CSS Animations -->
        <style>
          /* Base Animations */
          .mascot-avatar {
            width: 100%;
            height: 100%;
            overflow: visible;
          }
          
          /* Bobbing & Breathing */
          .character-group {
            transform-origin: 100px 180px;
            animation: breathe 3s ease-in-out infinite;
          }
          @keyframes breathe {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-4px) scale(1.01); }
          }

          /* Head tilt */
          .head-group {
            transform-origin: 100px 110px;
            transition: transform 0.5s ease-in-out;
          }
          .state-ask .head-group {
            transform: rotate(4deg) translateY(-2px);
          }
          .state-sad .head-group {
            transform: rotate(-3deg) translateY(4px);
          }
          .state-happy .head-group {
            transform: rotate(0) translateY(-6px) scale(1.02);
            animation: bounce-head 0.6s ease-in-out infinite alternate;
          }
          @keyframes bounce-head {
            0% { transform: rotate(-2deg) translateY(-4px); }
            100% { transform: rotate(2deg) translateY(-8px); }
          }

          /* Eyes */
          .eye-left, .eye-right {
            transform-origin: 75px 105px;
            transition: all 0.3s ease-in-out;
          }
          .eye-right {
            transform-origin: 125px 105px;
          }
          
          /* Blinking */
          .eye-pupil {
            animation: blink 4s infinite;
            transform-origin: 75px 105px;
          }
          .eye-right .eye-pupil {
            transform-origin: 125px 105px;
          }
          @keyframes blink {
            0%, 96%, 100% { transform: scaleY(1); }
            98% { transform: scaleY(0.05); }
          }

          /* Eye states depending on mood */
          .state-happy .eye-pupil {
            display: none;
          }
          .state-happy .eye-happy {
            display: block !important;
            stroke: #ff007f;
            stroke-width: 4;
            fill: none;
            stroke-linecap: round;
          }
          
          .state-sad .eye-pupil {
            transform: scaleY(0.8) scaleX(0.9);
          }
          .state-sad .eye-sad-tear {
            display: block !important;
            animation: drip 1.5s infinite;
          }
          @keyframes drip {
            0% { transform: translateY(0); opacity: 0; }
            30% { opacity: 0.8; }
            100% { transform: translateY(20px); opacity: 0; }
          }

          /* Mouth movements */
          .mouth {
            transform-origin: 100px 120px;
            transition: all 0.3s ease-in-out;
          }
          /* Talking animation during ask and walk-in */
          .state-ask .mouth, .state-walkin .mouth {
            animation: talk 0.4s ease-in-out infinite alternate;
          }
          @keyframes talk {
            0% { d: path("M 92 120 Q 100 120 108 120"); }
            100% { d: path("M 92 120 Q 100 132 108 120"); }
          }
          .state-happy .mouth {
            d: path("M 90 118 Q 100 135 110 118");
            fill: #ff007f;
          }
          .state-sad .mouth {
            d: path("M 92 124 Q 100 116 108 124");
            fill: none;
          }

          /* Sparkles & Hearts (Mood FX) */
          .fx-heart, .fx-sparkle, .fx-sweat {
            display: none;
            transform-origin: center;
          }
          .state-happy .fx-sparkle {
            display: block;
            animation: spin-sparkle 2s linear infinite;
          }
          .state-happy .fx-heart {
            display: block;
            animation: float-heart 1.5s ease-in-out infinite;
          }
          .state-sad .fx-sweat {
            display: block;
            animation: pulse-sweat 1s ease-in-out infinite alternate;
          }

          @keyframes spin-sparkle {
            0% { transform: translate(150px, 60px) rotate(0deg) scale(0.6); opacity: 0.8; }
            50% { transform: translate(155px, 55px) rotate(180deg) scale(1); opacity: 1; }
            100% { transform: translate(150px, 60px) rotate(360deg) scale(0.6); opacity: 0.8; }
          }
          @keyframes float-heart {
            0% { transform: translate(45px, 80px) scale(0.5); opacity: 0; }
            50% { opacity: 0.9; }
            100% { transform: translate(35px, 50px) scale(1.2); opacity: 0; }
          }
          @keyframes pulse-sweat {
            0% { transform: translate(135px, 95px) scale(0.8); opacity: 0.5; }
            100% { transform: translate(135px, 98px) scale(1.2); opacity: 0.9; }
          }

          /* Floating effect on the entire canvas */
          .state-walkin {
            animation: slide-in 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }
          @keyframes slide-in {
            0% { transform: translateY(120px) scale(0.5); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
        </style>
      </defs>

      <!-- FX Layer -->
      <!-- Sparkle (Happy) -->
      <path class="fx-sparkle" d="M 10 0 L 13 7 L 20 10 L 13 13 L 10 20 L 7 13 L 0 10 L 7 7 Z" fill="#ffd700" filter="url(#glow)"/>
      <!-- Heart (Happy) -->
      <path class="fx-heart" d="M 12 5 C 10 1.5 6 1.5 4 4 C 2 6.5 4 10 12 16 C 20 10 22 6.5 20 4 C 18 1.5 14 1.5 12 5 Z" fill="#ff4d6d" />
      <!-- Sweat (Sad) -->
      <path class="fx-sweat" d="M 6 0 C 6 0 12 8 12 12 C 12 15.3 9.3 18 6 18 C 2.7 18 0 15.3 0 12 C 0 8 6 0 6 0 Z" fill="#00bfff" />

      <!-- Main Mascot Group -->
      <g class="character-group">
        <!-- Body / Clothes -->
        <g class="body-group">
          <!-- Hoodie Base -->
          <path d="M 50 170 C 50 170 30 190 25 210 C 20 225 30 240 70 240 L 130 240 C 170 240 180 225 175 210 C 170 190 150 170 150 170 L 100 185 Z" fill="url(#hoodie-grad)" />
          <!-- Hoodie Ribbon/Strings -->
          <path d="M 93 182 L 91 210 M 107 182 L 109 210" stroke="#ff007f" stroke-width="3" stroke-linecap="round" />
          <!-- Small Badge on Hoodie -->
          <circle cx="75" cy="205" r="7" fill="#ff007f" />
          <path d="M 72 205 L 78 205 M 75 202 L 75 208" stroke="#ffffff" stroke-width="1.5" />
        </g>

        <!-- Head Group -->
        <g class="head-group">
          <!-- Back Hair -->
          <path d="M 52 110 C 35 110 32 150 35 170 C 45 180 155 180 165 170 C 168 150 165 110 148 110 Z" fill="#4a0e4e" />

          <!-- Face -->
          <path d="M 55 90 C 55 55 145 55 145 90 C 145 130 135 150 100 150 C 65 150 55 130 55 90 Z" fill="url(#face-grad)" />

          <!-- Cheeks Blush -->
          <ellipse cx="70" cy="118" rx="8" ry="4" fill="#ff4d6d" opacity="0.3" />
          <ellipse cx="130" cy="118" rx="8" ry="4" fill="#ff4d6d" opacity="0.3" />

          <!-- Eyes Left -->
          <g class="eye-left">
            <!-- Normal Pupil -->
            <ellipse class="eye-pupil" cx="75" cy="105" rx="7" ry="11" fill="#1e1b4b" />
            <circle class="eye-pupil" cx="73" cy="101" r="3" fill="#ffffff" />
            <circle class="eye-pupil" cx="77" cy="109" r="1.5" fill="#ffffff" />
            <!-- Happy Curvy Eye -->
            <path class="eye-happy" d="M 68 108 Q 75 98 82 108" style="display: none;" />
          </g>

          <!-- Eyes Right -->
          <g class="eye-right">
            <!-- Normal Pupil -->
            <ellipse class="eye-pupil" cx="125" cy="105" rx="7" ry="11" fill="#1e1b4b" />
            <circle class="eye-pupil" cx="123" cy="101" r="3" fill="#ffffff" />
            <circle class="eye-pupil" cx="127" cy="109" r="1.5" fill="#ffffff" />
            <!-- Happy Curvy Eye -->
            <path class="eye-happy" d="M 118 108 Q 125 98 132 108" style="display: none;" />
            <!-- Sad Tear Droplet -->
            <path class="eye-sad-tear" d="M 125 112 C 125 112 128 116 128 118 C 128 119.5 126.7 121 125 121 C 123.3 121 122 119.5 122 118 C 122 116 125 112 125 112 Z" fill="#00bfff" style="display: none;" />
          </g>

          <!-- Eyebrows -->
          <path d="M 66 94 Q 74 90 82 95" stroke="#4a0e4e" stroke-width="2.5" stroke-linecap="round" fill="none" />
          <path d="M 118 95 Q 126 90 134 94" stroke="#4a0e4e" stroke-width="2.5" stroke-linecap="round" fill="none" />

          <!-- Mouth -->
          <path class="mouth" d="M 94 121 Q 100 125 106 121" stroke="#4a0e4e" stroke-width="3" stroke-linecap="round" fill="none" />

          <!-- Front Hair / Bangs -->
          <path d="M 50 85 C 50 85 62 48 100 48 C 138 48 150 85 150 85 C 150 85 140 68 130 75 C 120 82 115 95 115 95 C 115 95 108 72 100 80 C 92 88 88 100 88 100 C 88 100 82 72 70 75 C 58 78 50 85 50 85 Z" fill="url(#hair-grad)" />
          
          <!-- Cute Cat Ears -->
          <path d="M 55 58 L 32 30 C 30 28 35 48 42 56 Z" fill="url(#hair-grad)" />
          <path d="M 55 58 L 36 36 C 36 36 40 46 44 50 Z" fill="#ff4d6d" />
          
          <path d="M 145 58 L 168 30 C 170 28 165 48 158 56 Z" fill="url(#hair-grad)" />
          <path d="M 145 58 L 164 36 C 164 36 160 46 156 50 Z" fill="#ff4d6d" />
        </g>
      </g>
    </svg>
    `;
  },

  // Mount mascot into DOM container
  mount(containerId, initialState = 'idle') {
    const container = document.getElementById(containerId);
    if (!container) return null;
    container.innerHTML = this.getSVGMarkup(initialState);
    return {
      svg: container.querySelector('#mascot-svg'),
      // Set current mascot state
      setState(state) {
        const svg = document.getElementById('mascot-svg');
        if (svg) {
          // Remove old states
          svg.classList.remove('state-idle', 'state-walkin', 'state-ask', 'state-happy', 'state-sad');
          // Add new state
          svg.classList.add(`state-${state}`);
        }
      }
    };
  }
};

// Expose to window object for global script inclusion
window.Mascot = Mascot;
