export interface NotFoundPageConfig {
  appName?: string;
  playStoreUrl?: string;
  /** Requested path, shown to the visitor (escaped). */
  path?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderNotFoundPage(config: NotFoundPageConfig = {}): string {
  const {
    appName = 'Chat Aura',
    playStoreUrl = 'https://play.google.com/store/apps/details?id=com.chataura.app',
    path = '',
  } = config;
  const shownPath = path.length > 80 ? `${path.slice(0, 77)}…` : path;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Page not found · ${appName}</title>
    <meta name="description" content="The page you are looking for does not exist on ${appName}.">
    <meta name="robots" content="noindex, follow">
    <meta name="theme-color" content="#0a0a0f">
    <link rel="icon" type="image/jpeg" href="/favicon.jpg" sizes="any">
    <link rel="apple-touch-icon" href="/favicon.jpg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-deep: #0a0a0f;
            --bg-card: rgba(18, 18, 28, 0.72);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --text-primary: #f1f2f6;
            --text-secondary: #9ca3b8;
            --text-muted: #6b7280;
            --accent-cyan: #22d3ee;
            --accent-violet: #a78bfa;
            --accent-rose: #fb7185;
            --glow-cyan: rgba(34, 211, 238, 0.25);
            --glow-violet: rgba(167, 139, 250, 0.22);
            --font-head: 'Outfit', system-ui, sans-serif;
            --font-body: 'DM Sans', system-ui, sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
            margin: 0;
            font-family: var(--font-body);
            line-height: 1.6;
            color: var(--text-primary);
            background: var(--bg-deep);
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }
        .aurora {
            position: fixed;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            background:
                radial-gradient(ellipse 100% 80% at 50% -20%, var(--glow-violet), transparent 50%),
                radial-gradient(ellipse 80% 60% at 90% 30%, var(--glow-cyan), transparent 45%),
                radial-gradient(ellipse 60% 50% at 10% 75%, rgba(251, 113, 133, 0.12), transparent 45%);
        }
        .orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(60px);
            opacity: 0.35;
            z-index: 0;
            pointer-events: none;
            animation: drift 18s ease-in-out infinite alternate;
        }
        .orb.one { width: 320px; height: 320px; background: var(--accent-violet); top: -80px; left: -100px; }
        .orb.two { width: 260px; height: 260px; background: var(--accent-cyan); bottom: -90px; right: -80px; animation-delay: -6s; }
        @keyframes drift {
            from { transform: translate(0, 0) scale(1); }
            to { transform: translate(40px, 30px) scale(1.12); }
        }

        .page {
            position: relative;
            z-index: 1;
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            max-width: 1140px;
            margin: 0 auto;
            padding: 0 max(1rem, env(safe-area-inset-left)) 0 max(1rem, env(safe-area-inset-right));
        }
        header {
            padding: 1.5rem 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        .logo-wrap {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            text-decoration: none;
            color: inherit;
        }
        .logo-img {
            width: 44px;
            height: 44px;
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 0 16px rgba(34, 211, 238, 0.2);
        }
        .logo-wordmark {
            font-family: var(--font-head);
            font-weight: 700;
            font-size: 1.3rem;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, var(--text-primary), var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header-link {
            color: var(--text-secondary);
            text-decoration: none;
            font-weight: 500;
            font-size: 0.9375rem;
            transition: color 0.2s;
        }
        .header-link:hover { color: var(--accent-cyan); }

        main {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem 0 3rem;
        }
        .card {
            width: 100%;
            max-width: 620px;
            text-align: center;
            padding: clamp(2rem, 6vw, 3.25rem) clamp(1.25rem, 5vw, 3rem);
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 28px;
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        /* Voice-wave equaliser: on-brand for a voice/party app */
        .wave {
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 6px;
            height: 44px;
            margin-bottom: 1.25rem;
        }
        .wave span {
            width: 6px;
            border-radius: 6px;
            background: linear-gradient(180deg, var(--accent-cyan), var(--accent-violet));
            animation: eq 1.2s ease-in-out infinite;
            opacity: 0.85;
        }
        .wave span:nth-child(1) { height: 30%; animation-delay: -0.9s; }
        .wave span:nth-child(2) { height: 70%; animation-delay: -0.6s; }
        .wave span:nth-child(3) { height: 45%; animation-delay: -0.3s; }
        .wave span:nth-child(4) { height: 100%; animation-delay: -0.75s; }
        .wave span:nth-child(5) { height: 55%; animation-delay: -0.15s; }
        .wave span:nth-child(6) { height: 80%; animation-delay: -0.45s; }
        .wave span:nth-child(7) { height: 35%; animation-delay: -1.05s; }
        @keyframes eq {
            0%, 100% { transform: scaleY(0.35); }
            50% { transform: scaleY(1); }
        }
        .wave span { transform-origin: bottom; }

        .code {
            font-family: var(--font-head);
            font-weight: 800;
            font-size: clamp(5rem, 22vw, 8.5rem);
            line-height: 0.95;
            letter-spacing: -0.04em;
            margin: 0;
            background: linear-gradient(135deg, #ffffff 15%, var(--accent-cyan) 55%, var(--accent-violet) 90%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 10px 40px rgba(34, 211, 238, 0.18));
        }
        h1 {
            font-family: var(--font-head);
            font-weight: 700;
            font-size: clamp(1.4rem, 4.5vw, 1.9rem);
            letter-spacing: -0.02em;
            line-height: 1.25;
            margin: 1rem 0 0.6rem;
        }
        .lead {
            color: var(--text-secondary);
            font-size: clamp(0.95rem, 2.6vw, 1.05rem);
            max-width: 440px;
            margin: 0 auto;
        }
        .path {
            display: inline-block;
            max-width: 100%;
            margin-top: 1.1rem;
            padding: 0.35rem 0.85rem;
            border-radius: 9999px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-subtle);
            color: var(--text-muted);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 0.8125rem;
            overflow-wrap: anywhere;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.75rem;
            margin-top: 2rem;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            min-height: 48px;
            padding: 0.75rem 1.5rem;
            border-radius: 9999px;
            font-family: var(--font-head);
            font-weight: 600;
            font-size: 1rem;
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s;
        }
        .btn svg { width: 18px; height: 18px; flex-shrink: 0; }
        .btn-primary {
            background: linear-gradient(135deg, var(--accent-cyan), #06b6d4);
            color: #0a0a0f;
            box-shadow: 0 10px 30px -10px rgba(34, 211, 238, 0.6);
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 36px -10px rgba(34, 211, 238, 0.7); }
        .btn-ghost {
            background: rgba(167, 139, 250, 0.1);
            color: var(--text-primary);
            border: 1px solid rgba(167, 139, 250, 0.3);
        }
        .btn-ghost:hover { transform: translateY(-2px); background: rgba(167, 139, 250, 0.18); border-color: var(--accent-violet); }
        .btn:focus-visible, .header-link:focus-visible, .links a:focus-visible, .logo-wrap:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 3px;
        }

        .links {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border-subtle);
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.5rem 1.25rem;
            font-size: 0.875rem;
        }
        .links a {
            color: var(--text-secondary);
            text-decoration: none;
            transition: color 0.2s;
        }
        .links a:hover { color: var(--accent-cyan); }

        footer {
            text-align: center;
            padding: 1.5rem 0 max(1.5rem, env(safe-area-inset-bottom));
            color: var(--text-muted);
            font-size: 0.8125rem;
        }

        @media (max-width: 480px) {
            header { padding: 1.1rem 0; }
            .logo-img { width: 38px; height: 38px; }
            .logo-wordmark { font-size: 1.15rem; }
            .card { border-radius: 22px; }
            .actions { flex-direction: column; }
            .btn { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
            .orb, .wave span { animation: none; }
            .btn { transition: none; }
        }
    </style>
</head>
<body>
    <div class="aurora" aria-hidden="true"></div>
    <div class="orb one" aria-hidden="true"></div>
    <div class="orb two" aria-hidden="true"></div>

    <div class="page">
        <header>
            <a href="/" class="logo-wrap" aria-label="${appName} home">
                <img src="/logo.png" alt="" class="logo-img" width="44" height="44">
                <span class="logo-wordmark">${appName}</span>
            </a>
            <a href="/" class="header-link">Home</a>
        </header>

        <main>
            <section class="card" aria-labelledby="nf-title">
                <div class="wave" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <p class="code" aria-hidden="true">404</p>
                <h1 id="nf-title">This room is empty</h1>
                <p class="lead">The page you're looking for doesn't exist or has moved. Let's get you back to the party.</p>
                ${shownPath ? `<div class="path">${escapeHtml(shownPath)}</div>` : ''}

                <div class="actions">
                    <a href="/" class="btn btn-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
                        Back to home
                    </a>
                    <a href="${escapeHtml(playStoreUrl)}" class="btn btn-ghost" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                        Get the app
                    </a>
                </div>

                <nav class="links" aria-label="Helpful links">
                    <a href="/privacy-policy">Privacy Policy</a>
                    <a href="/terms-and-conditions">Terms</a>
                    <a href="/child-safety">Child Safety</a>
                    <a href="/delete-account">Delete Account</a>
                </nav>
            </section>
        </main>

        <footer>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</footer>
    </div>
</body>
</html>`;
}
