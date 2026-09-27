export function renderLegalLayout(title: string, content: string, updatedDate = 'February 24, 2026'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} – Chat Aura</title>
    <link rel="icon" type="image/jpeg" href="/favicon.jpg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 2.5rem 1.5rem;
            max-width: 760px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.7;
            color: #1e293b;
            background: #f8fafc;
        }
        .container {
            background: #ffffff;
            padding: 2.5rem 2rem;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
            border: 1px solid #e2e8f0;
        }
        a { color: #0284c7; text-decoration: none; font-weight: 500; }
        a:hover { text-decoration: underline; }
        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.85rem;
            margin-bottom: 0.5rem;
            color: #0f172a;
            font-weight: 700;
        }
        h2 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.25rem;
            margin-top: 1.85rem;
            margin-bottom: 0.65rem;
            color: #0f172a;
            font-weight: 600;
        }
        p, li { margin-bottom: 0.85rem; color: #475569; font-size: 0.98rem; }
        ul, ol { padding-left: 1.4rem; }
        .back {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            margin-bottom: 1.75rem;
            font-size: 0.92rem;
            color: #64748b;
        }
        .back:hover { color: #0284c7; }
        .updated { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.75rem; }
        .note {
            background: #f0fdf4;
            border-left: 4px solid #16a34a;
            padding: 1.15rem;
            margin: 1.5rem 0;
            border-radius: 0 8px 8px 0;
            color: #166534;
        }
        .footer-nav {
            margin-top: 2.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            font-size: 0.9rem;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back">← Back to Chat Aura</a>
        <h1>${title}</h1>
        <p class="updated">Effective date: ${updatedDate}</p>

        ${content}

        <div class="footer-nav">
            <div>© 2026 Chat Aura. All rights reserved.</div>
            <div><a href="/">Return to home</a></div>
        </div>
    </div>
</body>
</html>`;
}

export function renderPrivacyPolicy(): string {
  const content = `
    <p>This Privacy Policy describes how <strong>Chat Aura</strong> ("we", "our", or "the app") collects, uses, and shares information when you use our mobile application and related services.</p>

    <h2>1. Information We Collect</h2>
    <p>We may collect the following information:</p>
    <ul>
        <li><strong>Account Information:</strong> Name, phone number, email address, profile avatar, and bio provided during registration.</li>
        <li><strong>Device Information:</strong> Device model, operating system version, unique device identifiers, and FCM push tokens necessary to deliver calls and notifications.</li>
        <li><strong>Usage & Interaction Data:</strong> Call status, party room activity, gift transactions, and messaging metrics to maintain and improve app reliability.</li>
        <li><strong>Media & Audio:</strong> Audio and video streams handled real-time via Agora RTC for live room conversations and calls.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <p>We use collected data to:</p>
    <ul>
        <li>Provide, maintain, and optimize live party rooms, voice & video calling, and text chat.</li>
        <li>Process wallet top-ups, coins, gems, and virtual gift transactions securely.</li>
        <li>Send critical push notifications for incoming 1-to-1 calls and direct messages.</li>
        <li>Prevent fraud, enforce community guidelines, and safeguard user safety.</li>
        <li>Comply with applicable legal and statutory requirements.</li>
    </ul>

    <h2>3. Sharing of Information</h2>
    <p>We do not sell your personal information. We may share information only with trusted service providers who assist in operating the platform (such as Agora for RTC, Firebase for FCM, cloud hosting, and payment gateways) or when mandated by law enforcement authorities.</p>

    <h2>4. Data Security</h2>
    <p>We employ industry-standard encryption, strict access control, and TLS/SSL connections to secure personal data. While we implement rigorous protections, no transmission over the internet is completely infallible.</p>

    <h2>5. Your Rights & Account Deletion</h2>
    <p>You have the right to access, rectify, or permanently delete your account and personal data at any time directly inside the app or by visiting <a href="/delete-account">our Account Deletion page</a>.</p>

    <h2>6. Children's Privacy</h2>
    <p>Chat Aura is intended for users aged 13 and above. We enforce zero tolerance against minors using the service inappropriately and comply strictly with child safety legislation. See our <a href="/child-safety">Child Safety Standards</a>.</p>

    <h2>7. Contact Us</h2>
    <p>If you have questions regarding this Privacy Policy, please contact our support team at <a href="mailto:chataura@gmail.com">chataura@gmail.com</a>.</p>
  `;
  return renderLegalLayout('Privacy Policy', content);
}

export function renderTermsAndConditions(): string {
  const content = `
    <p>Welcome to <strong>Chat Aura</strong>. By accessing or using our mobile application and services, you agree to be bound by these Terms and Conditions.</p>

    <h2>1. Eligibility & User Accounts</h2>
    <p>You must be at least 13 years old (or the legal age of majority in your jurisdiction) to create an account. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account.</p>

    <h2>2. User Conduct & Community Standards</h2>
    <p>Chat Aura provides a welcoming space for live interaction. You agree not to:</p>
    <ul>
        <li>Transmit illegal, abusive, harassing, defamatory, or sexually explicit content.</li>
        <li>Engage in hate speech, harassment, impersonation, or predatory behavior.</li>
        <li>Exploit minors or share any child sexual abuse material (which results in immediate termination and reporting to legal authorities).</li>
        <li>Attempt to reverse-engineer, exploit bugs, or disrupt server infrastructure.</li>
    </ul>

    <h2>3. Virtual Items, Coins & Gifts</h2>
    <p>The app offers virtual currency (coins and gems) and virtual gifts. Virtual items hold no monetary value outside of the platform, cannot be refunded, and may not be traded outside designated in-app mechanisms.</p>

    <h2>4. Disclaimer of Warranties</h2>
    <p>Chat Aura is provided on an "as is" and "as available" basis without warranties of any kind. We do not guarantee uninterrupted, latency-free, or error-free real-time services.</p>

    <h2>5. Limitation of Liability</h2>
    <p>To the fullest extent permitted by applicable law, Chat Aura and its operators shall not be liable for any indirect, incidental, or consequential damages resulting from platform usage.</p>

    <h2>6. Termination</h2>
    <p>We reserve the right to suspend or terminate accounts that violate our community policies or terms without prior notice.</p>

    <h2>7. Contact</h2>
    <p>For inquiries regarding these Terms, contact us at <a href="mailto:chataura@gmail.com">chataura@gmail.com</a>.</p>
  `;
  return renderLegalLayout('Terms & Conditions', content);
}

export function renderDeleteAccount(): string {
  const content = `
    <p>You can delete your <strong>Chat Aura</strong> account and associated data at any time. Account deletion is fully automated and handled directly within the app and our backend. Once deleted, your account, gems, coins, and relationship bonds cannot be recovered.</p>

    <h2>How to Delete Your Account In-App</h2>
    <ol style="padding-left: 1.4rem; line-height: 1.8;">
        <li>Open the <strong>Chat Aura</strong> app on your Android device.</li>
        <li>Tap on <strong>Profile</strong> (bottom-right icon).</li>
        <li>Open <strong>Settings</strong> or <strong>Account</strong>.</li>
        <li>Select <strong>Delete Account</strong> and follow the on-screen confirmation steps.</li>
    </ol>

    <div class="note">
        <strong>Important:</strong> There is no need to write an email or wait for manual verification—account deletion is executed instantly when confirmed inside the app.
    </div>

    <h2>What Gets Deleted</h2>
    <ul>
        <li>Your profile information, avatar, nickname, and account credentials.</li>
        <li>Wallet balances, transaction history logs, and agency associations.</li>
        <li>All private chat records, friendship connections, and CP/BCP bonds.</li>
    </ul>

    <h2>Need Help?</h2>
    <p>If you have lost access to your device or need assistance, contact our technical support team at <a href="mailto:chataura@gmail.com">chataura@gmail.com</a>.</p>
  `;
  return renderLegalLayout('Delete Your Account', content);
}

export function renderChildSafety(): string {
  const content = `
    <p><strong>Chat Aura</strong> enforces an absolute, zero-tolerance policy against child sexual abuse and exploitation (CSAE). We are committed to maintaining a safe environment for all community members.</p>

    <h2>1. Strictly Prohibited Content & Behavior</h2>
    <p>The following activities will trigger immediate, permanent account termination and referral to law enforcement:</p>
    <ul>
        <li>Child sexual abuse material (CSAM) or any form of child exploitation.</li>
        <li>Grooming, sexual solicitation, or predatory contact involving minors.</li>
        <li>Any illegal activity or content that endangers children under the age of 18.</li>
    </ul>

    <h2>2. In-App Reporting & Moderation</h2>
    <p>Users have access to instant reporting mechanisms across party rooms, private messaging, and user profiles. Reports categorized under safety concerns are prioritized and investigated immediately by our moderation staff.</p>

    <h2>3. Legal Compliance & Reporting</h2>
    <p>Chat Aura complies with all applicable child protection laws and national/international reporting frameworks. When confirmed CSAM or CSAE incidents occur, we promptly cooperate with relevant child protection bodies and law enforcement agencies.</p>

    <h2>4. Age Restrictions</h2>
    <p>Chat Aura requires all users to be at least 13 years of age. Accounts identified as belonging to underage individuals are removed immediately.</p>

    <h2>5. Official Safety Contact</h2>
    <p>For urgent child safety concerns, please contact our dedicated safety officer:</p>
    <p>
        <strong>Email:</strong> <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a><br>
        <strong>Platform:</strong> Chat Aura<br>
        <strong>Jurisdiction:</strong> India
    </p>
  `;
  return renderLegalLayout('Child Safety Standards', content);
}
