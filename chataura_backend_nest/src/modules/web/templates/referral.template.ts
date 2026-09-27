export function renderReferralPage(
  referralCode: string | null,
  baseUrl = 'https://chataura.in',
  playStoreUrl = 'https://play.google.com/store/apps/details?id=com.chataura.app',
): string {
  const code = referralCode ? String(referralCode).trim() : null;
  const deepLink = code
    ? `chataura://referral?code=${encodeURIComponent(code)}`
    : `chataura://app`;
  const title = code
    ? `Join Chat Aura with Invite Code ${code}`
    : `Join Chat Aura — Voice, Video & Party Rooms`;
  const description =
    'Connect with friends, chat in live voice party rooms, send 3D gifts, and level up together.';
  const canonicalUrl = code ? `${baseUrl}/invite/${code}` : `${baseUrl}/register`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonicalUrl}">
    <link rel="icon" type="image/jpeg" href="/favicon.jpg">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Chat Aura">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalUrl}">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">

    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: 'DM Sans', system-ui, sans-serif;
            background: #0a0a0f;
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }
        .aurora {
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at 50% 20%, rgba(34, 211, 238, 0.2), transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(167, 139, 250, 0.18), transparent 45%);
            pointer-events: none;
        }
        .card {
            position: relative;
            z-index: 1;
            max-width: 440px;
            width: 100%;
            background: rgba(18, 18, 28, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            text-align: center;
            backdrop-filter: blur(12px);
        }
        .logo-head {
            padding: 32px 20px 10px;
        }
        .logo-img {
            width: 64px;
            height: 64px;
            border-radius: 16px;
            box-shadow: 0 0 25px rgba(34, 211, 238, 0.35);
        }
        .logo-title {
            margin-top: 12px;
            font-family: 'Outfit', sans-serif;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #ffffff, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .content {
            padding: 16px 24px 32px;
        }
        h1 {
            font-family: 'Outfit', sans-serif;
            margin: 0 0 10px 0;
            font-size: 20px;
            line-height: 1.35;
            color: #f1f2f6;
        }
        p {
            margin: 0 0 20px 0;
            color: #94a3b8;
            font-size: 15px;
            line-height: 1.5;
        }
        .code-pill {
            font-family: ui-monospace, monospace;
            background: #111827;
            border: 1px dashed #38bdf8;
            border-radius: 12px;
            padding: 10px 20px;
            display: inline-block;
            margin-bottom: 20px;
            color: #38bdf8;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.1em;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.15);
        }
        .actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .btn-open {
            display: block;
            text-decoration: none;
            background: linear-gradient(135deg, #22d3ee, #0284c7);
            color: #0a0a0f;
            font-weight: 700;
            padding: 14px;
            border-radius: 12px;
            font-size: 16px;
            box-shadow: 0 4px 20px rgba(34, 211, 238, 0.35);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-open:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(34, 211, 238, 0.45);
        }
        .btn-store {
            display: block;
            text-decoration: none;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.05);
            color: #e2e8f0;
            font-weight: 600;
            padding: 12px;
            border-radius: 12px;
            font-size: 15px;
            transition: background 0.2s, border-color 0.2s;
        }
        .btn-store:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.3);
        }
        .hint {
            margin-top: 18px;
            font-size: 13px;
            color: #64748b;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="aurora"></div>
    <main class="card">
        <div class="logo-head">
            <img src="/logo.png" alt="Chat Aura" class="logo-img">
            <div class="logo-title">Chat Aura</div>
        </div>
        <div class="content">
            <h1>${title}</h1>
            <p>${description}</p>
            ${code ? `<div class="code-pill">${code}</div>` : ''}

            <div class="actions">
                <a class="btn-open" href="${deepLink}">Open in Chat Aura App</a>
                <a class="btn-store" href="${playStoreUrl}" target="_blank" rel="noopener noreferrer">Download on Google Play</a>
            </div>

            <div class="hint">
                If the app doesn't open automatically, install from Google Play and enter referral code <strong>${code || ''}</strong> during signup.
            </div>
        </div>
    </main>

    <script>
        (function () {
            var deepLink = ${JSON.stringify(deepLink)};
            var playStoreUrl = ${JSON.stringify(playStoreUrl)};
            var fallbackDelay = 1800;
            var start = Date.now();
            var didHide = false;

            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    didHide = true;
                }
            });

            window.location.href = deepLink;

            setTimeout(function () {
                var elapsed = Date.now() - start;
                if (!didHide && elapsed < fallbackDelay + 600) {
                    var ua = navigator.userAgent || '';
                    var isAndroid = /Android/i.test(ua);
                    if (isAndroid && playStoreUrl) {
                        window.location.href = playStoreUrl;
                    }
                }
            }, fallbackDelay);
        })();
    </script>
</body>
</html>`;
}
