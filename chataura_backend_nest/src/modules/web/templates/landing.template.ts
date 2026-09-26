export interface LandingPageConfig {
  appName: string;
  baseUrl: string;
  playStoreUrl: string;
  hasLocalApk: boolean;
  apkDownloadUrl: string;
}

export function renderLandingPage(config: LandingPageConfig): string {
  const {
    appName = 'Chat Aura',
    baseUrl = 'https://chataura.in',
    playStoreUrl = 'https://play.google.com/store/apps/details?id=com.chataura.app',
    hasLocalApk = false,
    apkDownloadUrl = `${baseUrl}/apk/ChatAura.apk`,
  } = config;

  const seoTitle = 'Chat Aura — Voice, Video & Party Rooms | Social Audio & Live Rooms';
  const seoDescription =
    'Chat Aura is your ultimate social space: party rooms, 1-to-1 voice & video calls, virtual gifts, and real-time chat. Download the Android app and connect with friends.';
  const ogImage = `${baseUrl}/favicon.jpg`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <!-- Favicon -->
    <link rel="icon" type="image/jpeg" href="/favicon.jpg" sizes="any">
    <link rel="apple-touch-icon" href="/favicon.jpg">

    <!-- SEO Title & Meta -->
    <title>${seoTitle}</title>
    <meta name="title" content="${seoTitle}">
    <meta name="description" content="${seoDescription}">
    <link rel="canonical" href="${baseUrl}">

    <!-- Open Graph (Facebook, LinkedIn) -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${baseUrl}">
    <meta property="og:title" content="${seoTitle}">
    <meta property="og:description" content="${seoDescription}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:site_name" content="${appName}">
    <meta property="og:locale" content="en_US">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${baseUrl}">
    <meta name="twitter:title" content="${seoTitle}">
    <meta name="twitter:description" content="${seoDescription}">
    <meta name="twitter:image" content="${ogImage}">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-deep: #0a0a0f;
            --bg-card: rgba(18, 18, 28, 0.72);
            --bg-card-hover: rgba(28, 28, 42, 0.92);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --text-primary: #f1f2f6;
            --text-secondary: #9ca3b8;
            --text-muted: #6b7280;
            --accent-cyan: #22d3ee;
            --accent-violet: #a78bfa;
            --accent-rose: #fb7185;
            --accent-gold: #facc15;
            --glow-cyan: rgba(34, 211, 238, 0.25);
            --glow-violet: rgba(167, 139, 250, 0.22);
            --font-head: 'Outfit', system-ui, sans-serif;
            --font-body: 'DM Sans', system-ui, sans-serif;
        }

        *, *::before, *::after { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
            margin: 0;
            font-family: var(--font-body);
            font-size: 1rem;
            line-height: 1.6;
            color: var(--text-primary);
            background: var(--bg-deep);
            min-height: 100vh;
            overflow-x: hidden;
        }

        /* Ambient aurora lighting */
        .aurora {
            position: fixed;
            inset: 0;
            z-index: 0;
            background:
                radial-gradient(ellipse 100% 80% at 50% -20%, var(--glow-violet), transparent 50%),
                radial-gradient(ellipse 80% 60% at 90% 30%, var(--glow-cyan), transparent 45%),
                radial-gradient(ellipse 60% 50% at 10% 70%, rgba(251, 113, 133, 0.12), transparent 45%);
            pointer-events: none;
        }

        .wrap {
            position: relative;
            z-index: 1;
            max-width: 1140px;
            margin: 0 auto;
            padding: 0 1.5rem;
        }

        /* Header */
        header {
            padding: 1.5rem 0 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 1.25rem;
        }
        .logo-wrap {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            text-decoration: none;
            color: inherit;
        }
        .logo-img {
            width: 48px;
            height: 48px;
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 0 16px rgba(34, 211, 238, 0.2);
        }
        .logo-wordmark {
            font-family: var(--font-head);
            font-weight: 700;
            font-size: 1.4rem;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, var(--text-primary), var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        nav {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 1.25rem;
        }
        nav a {
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.9375rem;
            font-weight: 500;
            transition: color 0.2s, transform 0.2s;
        }
        nav a:hover {
            color: var(--accent-cyan);
            transform: translateY(-1px);
        }
        .nav-btn {
            padding: 0.45rem 1.1rem;
            border-radius: 9999px;
            background: rgba(34, 211, 238, 0.12);
            color: var(--accent-cyan) !important;
            border: 1px solid rgba(34, 211, 238, 0.28);
            font-weight: 600;
        }
        .nav-btn:hover {
            background: rgba(34, 211, 238, 0.22);
            border-color: var(--accent-cyan);
        }

        /* Hero */
        .hero {
            text-align: center;
            padding: 3.5rem 0 3.5rem;
        }
        .hero .logo-hero {
            width: 100px;
            height: 100px;
            object-fit: contain;
            border-radius: 24px;
            margin-bottom: 1.5rem;
            box-shadow: 0 0 45px var(--glow-cyan);
            animation: pulse-glow 3s ease-in-out infinite alternate;
        }
        @keyframes pulse-glow {
            from { box-shadow: 0 0 35px var(--glow-cyan); }
            to { box-shadow: 0 0 60px rgba(34, 211, 238, 0.45); }
        }
        .hero h1 {
            font-family: var(--font-head);
            font-weight: 800;
            font-size: clamp(2.5rem, 6vw, 4rem);
            letter-spacing: -0.035em;
            margin: 0 0 0.85rem;
            line-height: 1.12;
            background: linear-gradient(135deg, #ffffff 40%, var(--accent-cyan) 85%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .hero .tagline {
            font-size: clamp(1.05rem, 2.2vw, 1.35rem);
            color: var(--text-secondary);
            max-width: 580px;
            margin: 0 auto 1.5rem;
            line-height: 1.5;
        }
        .hero .sub {
            color: var(--accent-violet);
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 2rem;
        }

        /* Hero CTA Buttons */
        .hero-actions {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 3.5rem;
        }
        .btn-primary {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.95rem 1.85rem;
            background: linear-gradient(135deg, var(--accent-cyan), #06b6d4);
            color: #0a0a0f;
            text-decoration: none;
            font-weight: 700;
            font-size: 1.05rem;
            border-radius: 14px;
            box-shadow: 0 6px 28px rgba(34, 211, 238, 0.38);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 36px rgba(34, 211, 238, 0.52);
        }
        .btn-primary svg { width: 24px; height: 24px; flex-shrink: 0; }
        .btn-secondary {
            display: inline-flex;
            align-items: center;
            gap: 0.65rem;
            padding: 0.95rem 1.65rem;
            background: var(--bg-card);
            color: var(--text-primary);
            text-decoration: none;
            font-weight: 600;
            font-size: 1rem;
            border-radius: 14px;
            border: 1px solid var(--border-subtle);
            transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .btn-secondary:hover {
            background: var(--bg-card-hover);
            border-color: rgba(34, 211, 238, 0.3);
            transform: translateY(-2px);
        }

        /* App Showcase Slider / Preview */
        .showcase-sec {
            margin: 2rem 0 4rem;
            text-align: center;
        }
        .showcase-slider {
            display: flex;
            gap: 1.25rem;
            overflow-x: auto;
            padding: 1rem 0.5rem 1.5rem;
            scroll-snap-type: x mandatory;
            scrollbar-width: thin;
            scrollbar-color: rgba(34, 211, 238, 0.3) transparent;
        }
        .showcase-slider::-webkit-scrollbar { height: 6px; }
        .showcase-slider::-webkit-scrollbar-thumb {
            background: rgba(34, 211, 238, 0.3);
            border-radius: 10px;
        }
        .showcase-item {
            flex: 0 0 240px;
            scroll-snap-align: center;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
            border: 1px solid var(--border-subtle);
            transition: transform 0.25s, border-color 0.25s;
            background: #111827;
        }
        .showcase-item:hover {
            transform: translateY(-4px) scale(1.02);
            border-color: var(--accent-cyan);
        }
        .showcase-item img {
            width: 100%;
            height: auto;
            display: block;
        }

        /* Welcome card */
        .welcome {
            max-width: 820px;
            margin: 0 auto 4rem;
            padding: 2.25rem 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 22px;
            text-align: center;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(12px);
        }
        .welcome p {
            margin: 0 0 1.15rem;
            color: var(--text-secondary);
            font-size: 1.0625rem;
            line-height: 1.75;
        }
        .welcome p:last-child { margin-bottom: 0; }

        /* Section Titles */
        .sec {
            padding: 3.5rem 0;
        }
        .sec-title {
            font-family: var(--font-head);
            font-weight: 700;
            font-size: clamp(1.65rem, 3.5vw, 2.25rem);
            text-align: center;
            margin: 0 0 0.65rem;
            letter-spacing: -0.02em;
        }
        .sec-desc {
            text-align: center;
            color: var(--text-secondary);
            max-width: 580px;
            margin: 0 auto 3rem;
            font-size: 1.05rem;
        }

        /* Features Grid */
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
            gap: 1.5rem;
        }
        .feature-card {
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 18px;
            padding: 1.75rem;
            transition: background 0.25s, border-color 0.25s, transform 0.2s, box-shadow 0.25s;
            backdrop-filter: blur(10px);
        }
        .feature-card:hover {
            background: var(--bg-card-hover);
            border-color: rgba(34, 211, 238, 0.25);
            transform: translateY(-4px);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        }
        .feature-card .icon {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.45rem;
            margin-bottom: 1.25rem;
        }
        .feature-card .icon.rooms { background: linear-gradient(135deg, rgba(167, 139, 250, 0.3), rgba(139, 92, 246, 0.15)); }
        .feature-card .icon.calls { background: linear-gradient(135deg, rgba(34, 211, 238, 0.3), rgba(6, 182, 212, 0.15)); }
        .feature-card .icon.gifts { background: linear-gradient(135deg, rgba(251, 113, 133, 0.3), rgba(244, 63, 94, 0.15)); }
        .feature-card .icon.chat { background: linear-gradient(135deg, rgba(52, 211, 153, 0.3), rgba(16, 185, 129, 0.15)); }
        .feature-card .icon.wallet { background: linear-gradient(135deg, rgba(250, 204, 21, 0.28), rgba(234, 179, 8, 0.15)); }
        .feature-card .icon.invite { background: linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(167, 139, 250, 0.2)); }
        .feature-card h3 {
            font-family: var(--font-head);
            font-weight: 600;
            font-size: 1.2rem;
            margin: 0 0 0.45rem;
        }
        .feature-card p {
            margin: 0;
            font-size: 0.95rem;
            color: var(--text-secondary);
            line-height: 1.6;
        }

        /* Experience feature blocks */
        .feature-block {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1.5rem;
            align-items: start;
            max-width: 900px;
            margin: 0 auto 2.5rem;
            padding: 2.25rem 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 22px;
            transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s;
            backdrop-filter: blur(10px);
        }
        .feature-block:hover {
            border-color: rgba(34, 211, 238, 0.2);
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
            transform: translateY(-2px);
        }
        @media (min-width: 640px) {
            .feature-block { grid-template-columns: 60px 1fr; gap: 2rem; }
        }
        .feature-block .block-icon {
            width: 60px;
            height: 60px;
            border-radius: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.85rem;
            flex-shrink: 0;
        }
        .feature-block .block-icon.msg { background: linear-gradient(135deg, rgba(52, 211, 153, 0.28), rgba(16, 185, 129, 0.18)); }
        .feature-block .block-icon.call { background: linear-gradient(135deg, rgba(34, 211, 238, 0.28), rgba(6, 182, 212, 0.18)); }
        .feature-block .block-icon.party { background: linear-gradient(135deg, rgba(167, 139, 250, 0.28), rgba(139, 92, 246, 0.18)); }
        .feature-block .block-icon.gift { background: linear-gradient(135deg, rgba(251, 113, 133, 0.28), rgba(244, 63, 94, 0.18)); }
        .feature-block .block-icon.profile { background: linear-gradient(135deg, rgba(250, 204, 21, 0.25), rgba(234, 179, 8, 0.15)); }
        .feature-block h3 {
            font-family: var(--font-head);
            font-weight: 600;
            font-size: 1.4rem;
            margin: 0 0 0.5rem;
        }
        .feature-block .block-desc {
            color: var(--text-secondary);
            margin: 0 0 1rem;
            font-size: 1rem;
        }
        .feature-block ul {
            margin: 0;
            padding: 0;
            list-style: none;
        }
        .feature-block ul li {
            position: relative;
            padding-left: 1.5rem;
            margin-bottom: 0.65rem;
            color: var(--text-secondary);
            font-size: 0.95rem;
        }
        .feature-block ul li::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0.55rem;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--accent-cyan);
            box-shadow: 0 0 8px var(--accent-cyan);
        }

        /* Divider */
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--border-subtle), transparent);
            margin: 3.5rem auto;
            max-width: 680px;
        }

        /* About list */
        .about-list {
            max-width: 720px;
            margin: 0 auto;
            list-style: none;
            padding: 0;
        }
        .about-list li {
            display: flex;
            align-items: flex-start;
            gap: 1.25rem;
            padding: 1.15rem 0;
            border-bottom: 1px solid var(--border-subtle);
        }
        .about-list li:last-child { border-bottom: none; }
        .about-list .bullet {
            flex-shrink: 0;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-violet));
            margin-top: 0.45rem;
            box-shadow: 0 0 8px var(--accent-cyan);
        }
        .about-list strong { color: var(--text-primary); }

        /* Download Section */
        .download-sec {
            padding: 4.5rem 2rem;
            text-align: center;
            background: linear-gradient(180deg, rgba(18, 18, 28, 0.5), rgba(34, 211, 238, 0.08));
            border-radius: 28px;
            border: 1px solid rgba(34, 211, 238, 0.18);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
            margin: 4rem 0;
        }
        .download-sec h2 {
            font-family: var(--font-head);
            font-weight: 800;
            font-size: clamp(1.85rem, 4vw, 2.5rem);
            margin: 0 0 0.65rem;
        }
        .download-sec .download-desc {
            color: var(--text-secondary);
            margin: 0 auto 2.25rem;
            max-width: 520px;
            font-size: 1.05rem;
        }
        .download-buttons {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.25rem;
            flex-wrap: wrap;
        }
        .download-sec .link-alt {
            display: block;
            margin-top: 1.25rem;
            color: var(--accent-cyan);
            font-size: 0.9375rem;
            text-decoration: none;
        }
        .download-sec .link-alt:hover { text-decoration: underline; }

        /* Footer */
        footer {
            padding: 2.5rem 0 3rem;
            border-top: 1px solid var(--border-subtle);
        }
        .footer-links {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 1.25rem 2rem;
        }
        .footer-links a {
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.95rem;
            transition: color 0.2s;
        }
        .footer-links a:hover { color: var(--accent-cyan); }
        .footer-copy {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.875rem;
            margin-top: 1.5rem;
        }
    </style>
</head>
<body>
    <div class="aurora" aria-hidden="true"></div>

    <div class="wrap">
        <!-- Header -->
        <header>
            <a href="/" class="logo-wrap">
                <img src="/logo.png" alt="Chat Aura Logo" class="logo-img" width="48" height="48">
                <span class="logo-wordmark">${appName}</span>
            </a>
            <nav>
                <a href="#features">Features</a>
                <a href="#experience">Experience</a>
                <a href="#download" class="nav-btn">Download App</a>
                <a href="/privacy-policy">Privacy</a>
                <a href="/terms-and-conditions">Terms</a>
                <a href="/child-safety">Child Safety</a>
            </nav>
        </header>

        <!-- Hero -->
        <section class="hero">
            <img src="/logo.png" alt="${appName} Icon" class="logo-hero" width="100" height="100">
            <h1>${appName}</h1>
            <p class="tagline">Where voice, video &amp; vibes connect. Party rooms, 1‑to‑1 calls, gifts, and real-time chat — all in one place.</p>
            <p class="sub">Social audio &amp; party rooms for Android</p>

            <div class="hero-actions">
                <a href="${playStoreUrl}" class="btn-primary" target="_blank" rel="noopener noreferrer" aria-label="Get Chat Aura on Google Play">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.674 6.287L3.61 22.186l10.89-9.479zM5.864 2.658L16.802 8.99l-2.302 2.302-8.636-8.634zm12.712 10.994l2.387 2.386a1 1 0 01-.047 1.454l-1.54 1.267-2.387-2.386 1.54-1.267a1 1 0 011.047-.054z"/></svg>
                    Download on Google Play
                </a>
                ${
                  hasLocalApk
                    ? `<a href="${apkDownloadUrl}" class="btn-secondary" download="ChatAura.apk">Direct APK Download</a>`
                    : `<a href="#download" class="btn-secondary">Explore App</a>`
                }
            </div>
        </section>

        <!-- App Screenshots Showcase -->
        <section class="showcase-sec">
            <div class="showcase-slider">
                <div class="showcase-item">
                    <img src="/screenshots/01_live_voice_party.jpg" alt="Chat Aura - Live Voice Party" loading="lazy">
                </div>
                <div class="showcase-item">
                    <img src="/screenshots/02_cp_bcp_bonds.jpg" alt="Chat Aura - CP & BCP Bonds" loading="lazy">
                </div>
                <div class="showcase-item">
                    <img src="/screenshots/03_spectacular_3d_gifts.jpg" alt="Chat Aura - Spectacular 3D Gifts" loading="lazy">
                </div>
                <div class="showcase-item">
                    <img src="/screenshots/04_lucky_77_spin_wheel.jpg" alt="Chat Aura - Lucky 77 & Spin Wheel" loading="lazy">
                </div>
                <div class="showcase-item">
                    <img src="/screenshots/05_global_leaderboard.jpg" alt="Chat Aura - Global Leaderboard" loading="lazy">
                </div>
                <div class="showcase-item">
                    <img src="/screenshots/06_private_chat_calls.jpg" alt="Chat Aura - Private Chat & HD Calls" loading="lazy">
                </div>
            </div>
        </section>

        <!-- Welcome Block -->
        <section class="welcome">
            <p>Welcome to <strong>Chat Aura</strong> — your ultimate social space to connect, communicate, and enjoy real-time interactions through chat, audio calls, video calls, and live party rooms.</p>
            <p>Chat Aura is designed to bring people closer through seamless communication and engaging social experiences. Whether you want to chat privately, join fun party rooms, or interact through live audio and video calls, Chat Aura provides a smooth and secure environment for meaningful connections.</p>
        </section>

        <!-- Download Section -->
        <section class="download-sec" id="download">
            <h2>Download Chat Aura</h2>
            <p class="download-desc">Get the app on your Android device and start connecting with friends through chat, calls, and live party rooms.</p>
            <div class="download-buttons">
                <a href="${playStoreUrl}" class="btn-primary" target="_blank" rel="noopener noreferrer" aria-label="Download Chat Aura on Google Play">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.674 6.287L3.61 22.186l10.89-9.479zM5.864 2.658L16.802 8.99l-2.302 2.302-8.636-8.634zm12.712 10.994l2.387 2.386a1 1 0 01-.047 1.454l-1.54 1.267-2.387-2.386 1.54-1.267a1 1 0 011.047-.054z"/></svg>
                    Download on Google Play
                </a>
                ${
                  hasLocalApk
                    ? `<a href="${apkDownloadUrl}" class="btn-secondary" download="ChatAura.apk">Download APK File</a>`
                    : ''
                }
            </div>
            ${
              hasLocalApk
                ? `<p class="link-alt">Direct link: <a href="${apkDownloadUrl}" download="ChatAura.apk" style="color: var(--accent-cyan);">${apkDownloadUrl}</a></p>`
                : ''
            }
        </section>

        <!-- Features Grid -->
        <section class="sec" id="features">
            <h2 class="sec-title">Everything in one app</h2>
            <p class="sec-desc">Chat Aura brings together live rooms, crystal-clear voice and video, virtual gifts, and instant messaging.</p>
            <div class="features">
                <article class="feature-card">
                    <div class="icon rooms">🎙️</div>
                    <h3>Party rooms</h3>
                    <p>Create or join live rooms. Take a seat, unmute, and talk — with optional video. Host controls, themes, and room settings.</p>
                </article>
                <article class="feature-card">
                    <div class="icon calls">📹</div>
                    <h3>Voice &amp; video calls</h3>
                    <p>One-to-one audio and video calls with push notifications when the app is closed. Reliable, low-latency with Agora.</p>
                </article>
                <article class="feature-card">
                    <div class="icon gifts">🎁</div>
                    <h3>Virtual gifts</h3>
                    <p>Send gifts in rooms or in private chat. Coins, wallet, and recharge packages. Support creators and level up your profile.</p>
                </article>
                <article class="feature-card">
                    <div class="icon chat">💬</div>
                    <h3>Real-time chat</h3>
                    <p>Text, emojis, and gifts in private conversations. Message status (sent, delivered, read) and FCM notifications.</p>
                </article>
                <article class="feature-card">
                    <div class="icon wallet">👛</div>
                    <h3>Wallet &amp; packages</h3>
                    <p>Recharge with packages, send gifts, convert gems to coins in-app. Transaction history and referral rewards.</p>
                </article>
                <article class="feature-card">
                    <div class="icon invite">✨</div>
                    <h3>Invite &amp; earn</h3>
                    <p>Share your invite code. Friends sign up, you earn. Lucky spin and room games add extra fun.</p>
                </article>
            </div>
        </section>

        <div class="divider" aria-hidden="true"></div>

        <!-- Experience Deep Dive -->
        <section class="sec" id="experience">
            <h2 class="sec-title">Designed for connection</h2>
            <p class="sec-desc">Every feature is built to keep you close to the people who matter.</p>

            <div class="feature-block">
                <div class="block-icon msg">💬</div>
                <div>
                    <h3>Smart Messaging</h3>
                    <p class="block-desc">Stay connected with your friends using our fast and simple chat system.</p>
                    <ul>
                        <li>One-to-one private chat</li>
                        <li>Real-time message delivery</li>
                        <li>Send emojis and interactive gifts</li>
                        <li>Instant notifications</li>
                    </ul>
                </div>
            </div>

            <div class="feature-block">
                <div class="block-icon call">📹</div>
                <div>
                    <h3>Audio &amp; Video Calling</h3>
                    <p class="block-desc">Experience high-quality calls anytime.</p>
                    <ul>
                        <li>1-to-1 audio calls</li>
                        <li>1-to-1 video calls</li>
                        <li>Group interaction support</li>
                        <li>Smooth connection and low latency</li>
                    </ul>
                </div>
            </div>

            <div class="feature-block">
                <div class="block-icon party">🎙️</div>
                <div>
                    <h3>Live Party Rooms</h3>
                    <p class="block-desc">Join or host party rooms and socialize in real time.</p>
                    <ul>
                        <li>Multi-user audio &amp; video interaction</li>
                        <li>Live chat inside rooms</li>
                        <li>Gift sharing and reactions</li>
                        <li>Interactive experience with friends</li>
                    </ul>
                </div>
            </div>

            <div class="feature-block">
                <div class="block-icon gift">🎁</div>
                <div>
                    <h3>Gifts &amp; Fun Engagement</h3>
                    <p class="block-desc">Make conversations more exciting.</p>
                    <ul>
                        <li>Send virtual gifts</li>
                        <li>Level-based experience system</li>
                        <li>Profile frames and rewards</li>
                    </ul>
                </div>
            </div>

            <div class="feature-block">
                <div class="block-icon profile">✨</div>
                <div>
                    <h3>Personal Profile &amp; Levels</h3>
                    <p class="block-desc">Show your personality and grow your presence.</p>
                    <ul>
                        <li>Profile customization</li>
                        <li>Level progression</li>
                        <li>Unlock special frames and features</li>
                    </ul>
                </div>
            </div>
        </section>

        <div class="divider" aria-hidden="true"></div>

        <!-- About Section -->
        <section class="sec" id="about">
            <h2 class="sec-title">What is Chat Aura?</h2>
            <p class="sec-desc">A social audio and party rooms Android app powered by a secure real-time backend infrastructure.</p>
            <ul class="about-list">
                <li>
                    <span class="bullet"></span>
                    <span><strong>Live rooms</strong> — Discover hot parties, create your own room with custom seats (1–20), enable video or gifts, and manage members. Agora powers voice and video.</span>
                </li>
                <li>
                    <span class="bullet"></span>
                    <span><strong>1‑to‑1 calls</strong> — Initiate or receive audio/video calls with FCM push so you never miss a call. Token-based auth and call state handled by the backend.</span>
                </li>
                <li>
                    <span class="bullet"></span>
                    <span><strong>Messages &amp; gifts</strong> — Send text, emojis, or gifts in conversations. Wallet deduction, admin commission, and notifications for new messages.</span>
                </li>
                <li>
                    <span class="bullet"></span>
                    <span><strong>Wallet &amp; safety</strong> — Recharge, send gifts, convert gems to coins. Privacy policy, terms, child safety, and delete-account options available on the web.</span>
                </li>
            </ul>
        </section>

        <!-- Footer -->
        <footer>
            <div class="footer-links">
                <a href="/privacy-policy">Privacy Policy</a>
                <a href="/terms-and-conditions">Terms &amp; Conditions</a>
                <a href="/delete-account">Delete Account</a>
                <a href="/child-safety">Child Safety</a>
            </div>
            <p class="footer-copy">© 2026 ${appName}. All rights reserved.</p>
        </footer>
    </div>
</body>
</html>
`;
}
