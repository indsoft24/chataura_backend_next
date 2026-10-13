export function renderLegalLayout(title: string, content: string, updatedDate = 'October 13, 2026'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} – Chat Aura</title>
    <link rel="icon" type="image/jpeg" href="/favicon.jpg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 2rem 1.25rem;
            max-width: 820px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.75;
            color: #1e293b;
            background: #f8fafc;
        }
        .container {
            background: #ffffff;
            padding: 2.75rem 2.25rem;
            border-radius: 18px;
            box-shadow: 0 4px 24px rgba(15, 23, 42, 0.05);
            border: 1px solid #e2e8f0;
        }
        a { color: #0284c7; text-decoration: none; font-weight: 500; }
        a:hover { text-decoration: underline; color: #0369a1; }
        .top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1.75rem;
            padding-bottom: 1.25rem;
            border-bottom: 1px solid #e2e8f0;
        }
        .back {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.92rem;
            color: #64748b;
            font-weight: 600;
        }
        .back:hover { color: #0284c7; }
        .nav-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .nav-chip {
            font-size: 0.8rem;
            padding: 0.35rem 0.75rem;
            border-radius: 9999px;
            background: #f1f5f9;
            color: #475569;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        .nav-chip:hover {
            background: #e0f2fe;
            color: #0369a1;
            text-decoration: none;
        }
        .nav-chip.active {
            background: #0284c7;
            color: #ffffff;
        }
        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 2rem;
            margin: 0.5rem 0 0.35rem 0;
            color: #0f172a;
            font-weight: 700;
            letter-spacing: -0.02em;
        }
        .updated {
            font-size: 0.875rem;
            color: #64748b;
            margin-bottom: 1.5rem;
        }
        .meta-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 1.15rem 1.35rem;
            margin-bottom: 2rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 0.75rem;
            font-size: 0.875rem;
        }
        .meta-item strong {
            color: #0f172a;
            display: block;
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 0.15rem;
        }
        .meta-item span {
            color: #334155;
            font-weight: 500;
        }
        h2 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.35rem;
            margin-top: 2.25rem;
            margin-bottom: 0.75rem;
            color: #0f172a;
            font-weight: 700;
            letter-spacing: -0.01em;
            padding-bottom: 0.4rem;
            border-bottom: 1px solid #f1f5f9;
        }
        h3 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.05rem;
            margin-top: 1.35rem;
            margin-bottom: 0.45rem;
            color: #1e293b;
            font-weight: 600;
        }
        p, li {
            margin-bottom: 0.85rem;
            color: #334155;
            font-size: 0.98rem;
        }
        ul, ol {
            padding-left: 1.5rem;
            margin-bottom: 1rem;
        }
        li {
            margin-bottom: 0.5rem;
        }
        .highlight-box {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 1.25rem;
            margin: 1.5rem 0;
            border-radius: 0 10px 10px 0;
            color: #991b1b;
        }
        .highlight-box strong {
            color: #7f1d1d;
            font-weight: 700;
        }
        .success-box {
            background: #f0fdf4;
            border-left: 4px solid #16a34a;
            padding: 1.25rem;
            margin: 1.5rem 0;
            border-radius: 0 10px 10px 0;
            color: #166534;
        }
        .contact-card {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 12px;
            padding: 1.25rem 1.5rem;
            margin-top: 1.5rem;
        }
        .footer-nav {
            margin-top: 3rem;
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
        @media (max-width: 640px) {
            body { padding: 1rem 0.75rem; }
            .container { padding: 1.75rem 1.25rem; }
            h1 { font-size: 1.6rem; }
            .meta-card { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="top-bar">
            <a href="/" class="back">← Back to Chat Aura</a>
            <div class="nav-chips">
                <a href="/child-safety" class="nav-chip ${title.includes('Child') ? 'active' : ''}">Child Safety Standards</a>
                <a href="/terms-and-conditions" class="nav-chip ${title.includes('Terms') ? 'active' : ''}">Terms &amp; Conditions</a>
                <a href="/privacy-policy" class="nav-chip ${title.includes('Privacy') ? 'active' : ''}">Privacy Policy</a>
                <a href="/delete-account" class="nav-chip ${title.includes('Delete') ? 'active' : ''}">Delete Account</a>
            </div>
        </div>

        <h1>${title}</h1>
        <p class="updated">Effective Date &amp; Last Updated: ${updatedDate}</p>

        <div class="meta-card">
            <div class="meta-item">
                <strong>Application Name</strong>
                <span>Chat Aura (ChatAura)</span>
            </div>
            <div class="meta-item">
                <strong>Package / Application ID</strong>
                <span>com.chataura.app</span>
            </div>
            <div class="meta-item">
                <strong>Developer Name</strong>
                <span>Chat Aura</span>
            </div>
            <div class="meta-item">
                <strong>Google Play Listing</strong>
                <span><a href="https://play.google.com/store/apps/details?id=com.chataura.app" target="_blank" rel="noopener">Chat Aura on Google Play</a></span>
            </div>
            <div class="meta-item">
                <strong>Developer Contact</strong>
                <span>Jameel Ahamad</span>
            </div>
            <div class="meta-item">
                <strong>Child Safety Point of Contact</strong>
                <span><a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a></span>
            </div>
        </div>

        ${content}

        <div class="footer-nav">
            <div>© 2026 <strong>Chat Aura</strong>. Published by <strong>Chat Aura</strong>. All rights reserved.</div>
            <div><a href="/">Return to Home</a></div>
        </div>
    </div>
</body>
</html>`;
}

export function renderChildSafety(): string {
  const content = `
    <div class="highlight-box">
        <strong>ZERO TOLERANCE POLICY:</strong> Chat Aura enforces an absolute, uncompromising zero-tolerance policy against Child Sexual Abuse and Exploitation (CSAE) and Child Sexual Abuse Material (CSAM). Any user engaging in, facilitating, or promoting CSAE or CSAM will face immediate permanent account termination, device hardware blacklisting, and mandatory immediate reporting to the National Center for Missing &amp; Exploited Children (NCMEC) and relevant law enforcement authorities.
    </div>

    <p>This Child Safety Standards Policy applies directly to the mobile application <strong>Chat Aura</strong> (Package ID: <code>com.chataura.app</code>), developed and published by <strong>Chat Aura</strong> (Developer: <strong>Chat Aura</strong> / Contact: <strong>Jameel Ahamad</strong>) as displayed on the Google Play store listing. We are committed to fostering a safe, respectful, and protected digital environment for all users and complying fully with Google Play's <a href="https://support.google.com/googleplay/android-developer/answer/9878809" target="_blank" rel="noopener">Child Safety Standards Policy</a>.</p>

    <h2>1. Strictly Prohibited Content &amp; Behaviors (CSAE / CSAM)</h2>
    <p>The following acts are strictly and explicitly prohibited on Chat Aura across all features, including live voice party rooms, video streams, direct messaging, user profiles, status updates, avatars, and audio transmissions:</p>
    <ul>
        <li><strong>Child Sexual Abuse Material (CSAM):</strong> Creating, uploading, transmitting, displaying, possessing, linking to, or distributing any visual or audio depiction of sexually explicit conduct involving a minor (any person under the age of 18).</li>
        <li><strong>Child Sexual Exploitation and Abuse (CSAE):</strong> Any form of sexual abuse, commercial exploitation, sex trafficking, or endangerment targeting a minor.</li>
        <li><strong>Child Grooming &amp; Seduction:</strong> Engaging in manipulative, deceptive, or predatory communication with minors to establish trust or emotional connection for the purpose of sexual exploitation, abuse, or illegal contact.</li>
        <li><strong>Sexual Solicitation of Minors:</strong> Requesting, offering, negotiating, or facilitating sexual acts, explicit imagery, nude media, or sexual services involving or directed at a minor.</li>
        <li><strong>Sextortion &amp; Predatory Blackmail:</strong> Threatening to expose explicit imagery or personal data of minors for coercion, harassment, or extortion.</li>
        <li><strong>Synthetic &amp; Illustrated Exploitation:</strong> Distributing or displaying computer-generated, AI-synthesized, illustrated, cartoon, or animated representations of minors in sexually explicit scenarios.</li>
    </ul>

    <h2>2. Minimum Age Requirements &amp; Underage Protection</h2>
    <p>Chat Aura is strictly intended for users who are <strong>13 years of age or older</strong> (or the legal age of digital consent in the user's jurisdiction, whichever is greater):</p>
    <ul>
        <li>Users under 13 are strictly prohibited from creating accounts or accessing the platform.</li>
        <li>Accounts identified as belonging to or operated by children under 13 are immediately deleted upon detection.</li>
        <li>All minors between 13 and 17 years of age are protected by rigorous safety restrictions, strict UGC moderation, and immediate intervention upon any report of inappropriate communication.</li>
    </ul>

    <h2>3. In-App User Reporting Procedures</h2>
    <p>Chat Aura provides multiple prominent, instant in-app reporting tools so users can report child safety violations, suspicious conduct, or CSAE immediately:</p>
    
    <h3>A. Reporting in Live Voice &amp; Video Party Rooms</h3>
    <ol>
        <li>Tap on the offending user's avatar on the microphone seat or in the room members list.</li>
        <li>In the profile dialogue that appears, tap the <strong>Report</strong> (Flag / Shield) icon.</li>
        <li>Select <strong>"Child Safety / CSAE Violation"</strong> from the report categories list.</li>
        <li>Tap <strong>Submit Report</strong>. The report is immediately dispatched with the highest priority to our 24/7 Safety Team, and the room host and moderators are notified to mute or remove the user instantly.</li>
    </ol>

    <h3>B. Reporting in Direct Messaging (1-to-1 Chat)</h3>
    <ol>
        <li>Inside any private conversation, press and hold the offending message, or tap the three dots (⋮) in the top-right header.</li>
        <li>Select <strong>"Report User / CSAE"</strong>.</li>
        <li>Confirm your submission. The report includes encrypted transmission context for moderator verification, and the offending user is automatically muted and blocked from contacting you.</li>
    </ol>

    <h3>C. Reporting User Profiles</h3>
    <ol>
        <li>Open the user's public profile card.</li>
        <li>Tap the three dots (⋮) or the <strong>Report</strong> button.</li>
        <li>Select <strong>"Child Sexual Abuse or Exploitation (CSAE)"</strong> and submit.</li>
    </ol>

    <h3>D. Emergency Safety Officer Escalation (Email)</h3>
    <p>Users, parents, guardians, and third-party safety organizations can report urgent CSAE matters directly to our designated safety desk at <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a> with the subject line <code>[URGENT CSAE REPORT]</code>. Include the reported user's Aura ID, room ID, timestamp, and relevant screenshots for expedited verification.</p>

    <h2>4. 24/7 Moderation &amp; Proactive Detection Systems</h2>
    <p>We deploy a multi-layered detection infrastructure to safeguard our platform in real time:</p>
    <ul>
        <li><strong>Automated Text &amp; Keyword Filtering:</strong> Real-time filtering scans public chat streams, nicknames, room titles, and profile bios to intercept predatory language, solicitation, and abusive keywords before delivery.</li>
        <li><strong>Media Hashing &amp; Safety Checks:</strong> Avatars, profile media, and room cover images are screened prior to publication.</li>
        <li><strong>Real-Time Stream Moderation:</strong> Party room audio and video streams powered by Agora RTC are monitored 24/7. Rooms flagged for policy violations are frozen and terminated instantly.</li>
        <li><strong>Priority Queue for CSAE Reports:</strong> All reports flagged under Child Safety bypass standard tickets and are routed immediately to trained child safety specialists.</li>
    </ul>

    <h2>5. Enforcement Protocols &amp; Penalties</h2>
    <p>Confirmed violations of our Child Safety Standards result in swift and irreversible enforcement:</p>
    <ul>
        <li><strong>Permanent Lifetime Account Ban:</strong> The violating user's account is immediately and permanently terminated.</li>
        <li><strong>Hardware &amp; Device Blacklisting:</strong> The violator's device identifiers (including hardware ID and Android ID) are permanently blacklisted to prevent re-registration.</li>
        <li><strong>IP Address Blocking:</strong> The originating IP addresses are blocked from communicating with our servers.</li>
        <li><strong>Asset &amp; Wallet Forfeiture:</strong> All in-app virtual items, diamonds, coins, gems, and VIP memberships are irreversibly forfeited without refund.</li>
        <li><strong>Evidence Preservation:</strong> Account logs, registration data, device fingerprints, and offending materials are securely sealed and preserved for statutory law enforcement handover.</li>
    </ul>

    <h2>6. Mandatory Reporting to NCMEC &amp; Law Enforcement</h2>
    <p>In accordance with applicable statutory duties, Google Play developer policies, and international child welfare treaties:</p>
    <ul>
        <li>Chat Aura reports all confirmed instances of Child Sexual Abuse Material (CSAM) and Child Sexual Abuse and Exploitation (CSAE) to the <strong>National Center for Missing &amp; Exploited Children (NCMEC)</strong> CyberTipline.</li>
        <li>We fully cooperate with local, national, and international law enforcement agencies (including the Cyber Crime Division of India, Interpol, and regional child protection authorities) by providing preserved digital evidence pursuant to valid legal process.</li>
    </ul>

    <h2>7. Designated Child Safety Point of Contact</h2>
    <p>For inquiries, lawful law enforcement requests, or urgent safety concerns regarding our Child Safety Standards, contact our Child Protection Officer:</p>
    
    <div class="contact-card">
        <strong>Child Safety Officer &amp; Support Desk</strong><br>
        <strong>Application:</strong> Chat Aura (Package: <code>com.chataura.app</code>)<br>
        <strong>Developer:</strong> Chat Aura (Publisher: Chat Aura / Jameel Ahamad)<br>
        <strong>Official Safety Email:</strong> <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a><br>
        <strong>Jurisdiction &amp; Region:</strong> India<br>
        <strong>Direct Policy URL:</strong> <a href="https://chataura.in/child-safety">https://chataura.in/child-safety</a>
    </div>
  `;
  return renderLegalLayout('Child Safety Standards', content);
}

export function renderTermsAndConditions(): string {
  const content = `
    <p>Welcome to <strong>Chat Aura</strong>. These Terms and Conditions ("Terms") constitute a legally binding agreement between you and <strong>Chat Aura</strong> (Developer: <strong>Chat Aura</strong> / Publisher: <strong>Jameel Ahamad</strong>), governing your access to and use of the <strong>Chat Aura</strong> mobile application (Package ID: <code>com.chataura.app</code>) and related online services available at <a href="https://chataura.in">https://chataura.in</a>.</p>

    <h2>1. Acceptance of Terms &amp; Eligibility</h2>
    <p>By downloading, installing, registering, or using Chat Aura, you agree to comply with and be bound by these Terms, our <a href="/privacy-policy">Privacy Policy</a>, and our <a href="/child-safety">Child Safety Standards</a>. If you do not agree, you must immediately cease all access and uninstall the application.</p>
    <p>You must be at least <strong>13 years of age</strong> (or the minimum legal age of digital consent in your jurisdiction) to create an account or use Chat Aura. By creating an account, you represent and warrant that you satisfy this age requirement.</p>

    <h2>2. User Conduct &amp; Prohibited Activities</h2>
    <p>Chat Aura provides interactive live voice party rooms, video streams, and text messaging. You agree to use the service only for lawful, respectful purposes. You shall not:</p>
    <ul>
        <li>Transmit defamatory, harassing, hateful, threatening, or sexually explicit content.</li>
        <li>Engage in cyberbullying, impersonation, hate speech, or unauthorized solicitation.</li>
        <li>Attempt to reverse-engineer, decompile, exploit bugs, or disrupt server infrastructure.</li>
        <li>Use automated scripts, bots, or unauthorized third-party tools to interact with the service.</li>
    </ul>

    <h2>3. Child Safety Standards &amp; Explicit Prohibition of CSAE</h2>
    <div class="highlight-box">
        <strong>STRICT CHILD SAFETY PROHIBITION:</strong> Chat Aura strictly prohibits Child Sexual Abuse and Exploitation (CSAE) and Child Sexual Abuse Material (CSAM) in any form. We maintain zero tolerance for grooming, exploitation, solicitation, or endangerment of minors under 18 years of age. Any violation results in immediate permanent account termination, device blacklisting, and reporting to the National Center for Missing &amp; Exploited Children (NCMEC) and law enforcement authorities.
    </div>
    <p>Please read our full, dedicated <a href="/child-safety">Child Safety Standards Policy</a> for comprehensive details regarding prohibited behaviors, 24/7 moderation, and step-by-step in-app reporting procedures.</p>

    <h2>4. Account Security &amp; Responsibility</h2>
    <p>You are solely responsible for safeguarding your login credentials and for all activities conducted through your account. You agree to immediately notify us of any unauthorized use or security breach by emailing <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a>.</p>

    <h2>5. Virtual Items, Coins, Gems &amp; In-App Economy</h2>
    <p>Chat Aura may offer virtual currency (Coins, Gems) and virtual gifts. All virtual items are licensed to you on a limited, revocable, non-transferable basis. Virtual items hold no real-world monetary value, cannot be redeemed or exchanged for cash or legal tender outside the platform, and are non-refundable except where required by applicable consumer law.</p>

    <h2>6. Termination of Service</h2>
    <p>We reserve the right, at our sole discretion, to suspend, disable, or permanently terminate your account and revoke access to Chat Aura at any time, without prior notice, if you violate these Terms, our Child Safety Standards, or any applicable legal regulation.</p>

    <h2>7. Disclaimer of Warranties</h2>
    <p>Chat Aura is provided on an "as is" and "as available" basis without warranties of any kind, whether express or implied. We do not warrant that the application will operate uninterrupted, error-free, or without network latency.</p>

    <h2>8. Limitation of Liability</h2>
    <p>To the fullest extent permitted under applicable law, Chat Aura, its developers, operators, and affiliates shall not be liable for any indirect, punitive, special, incidental, or consequential damages resulting from your use of or inability to use the service.</p>

    <h2>9. Contact Information</h2>
    <p>For questions or inquiries regarding these Terms and Conditions, please contact us at:</p>
    <div class="contact-card">
        <strong>Chat Aura Support &amp; Legal Desk</strong><br>
        <strong>Application:</strong> Chat Aura (<code>com.chataura.app</code>)<br>
        <strong>Developer:</strong> Chat Aura (Publisher: Chat Aura / Jameel Ahamad)<br>
        <strong>Email:</strong> <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a><br>
        <strong>Official Website:</strong> <a href="https://chataura.in">https://chataura.in</a>
    </div>
  `;
  return renderLegalLayout('Terms & Conditions', content);
}

export function renderPrivacyPolicy(): string {
  const content = `
    <p>This Privacy Policy describes how <strong>Chat Aura</strong> ("we", "our", or "the app"), developed and published by <strong>Chat Aura</strong> (Developer: <strong>Chat Aura</strong> / Publisher: <strong>Jameel Ahamad</strong>, Package ID: <code>com.chataura.app</code>), collects, uses, protects, and discloses personal information when you use our mobile application and related online services at <a href="https://chataura.in">https://chataura.in</a>.</p>

    <h2>1. Information We Collect</h2>
    <p>We collect information necessary to operate, improve, and secure our real-time social platform:</p>
    <ul>
        <li><strong>Account Information:</strong> Name, phone number, email address, profile avatar, gender, date of birth / age representation, and bio submitted upon registration.</li>
        <li><strong>Device &amp; Technical Information:</strong> Hardware model, operating system version, unique device identifiers (Android ID, IMEI), FCM push notification tokens, and IP address for security, abuse prevention, and call routing.</li>
        <li><strong>Usage &amp; Interaction Data:</strong> Live voice/video party room history, seated duration, virtual gift transactions, coins/gems balances, and friend connections.</li>
        <li><strong>Real-Time Audio &amp; Video Streams:</strong> Audio and video data transmitted during live party rooms and 1-on-1 calls, processed in real time via Agora RTC.</li>
        <li><strong>User-Generated Content &amp; Reports:</strong> Chat messages, uploaded images, room descriptions, and user reports submitted for safety reviews.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <p>Collected data is used strictly for legitimate operational purposes:</p>
    <ul>
        <li>Delivering real-time voice party rooms, video streams, and direct messaging features.</li>
        <li>Facilitating secure virtual currency transactions, wallet top-ups, and gift animations.</li>
        <li>Routing incoming voice and video call push notifications.</li>
        <li>Protecting community safety, investigating user reports, enforcing our <a href="/child-safety">Child Safety Standards</a>, and preventing fraud or malicious behavior.</li>
        <li>Complying with statutory legal obligations and lawful law enforcement requests.</li>
    </ul>

    <h2>3. Data Sharing &amp; Third-Party Services</h2>
    <p>We do not sell, rent, or trade your personal information. Data may be shared only with vetted third-party service providers essential to app operation under strict confidentiality agreements:</p>
    <ul>
        <li><strong>Agora.io:</strong> Real-time audio and video communications (RTC).</li>
        <li><strong>Google Firebase:</strong> Cloud Messaging (FCM) for push notifications and analytics.</li>
        <li><strong>Payment Processors:</strong> Secure in-app billing and payment gateway validation.</li>
        <li><strong>Law Enforcement &amp; Child Safety Bodies:</strong> When required by statutory process or under our mandatory duty to report Child Sexual Abuse Material (CSAM) to NCMEC.</li>
    </ul>

    <h2>4. Data Security &amp; Retention</h2>
    <p>We employ industry-standard cryptographic protections, HTTPS/TLS encryption in transit, authenticated access controls, and regular database security evaluations. We retain personal data only for as long as necessary to provide the services or fulfill statutory legal and audit obligations.</p>

    <h2>5. Children's Privacy &amp; Child Safety (CSAE Prevention)</h2>
    <div class="highlight-box">
        <strong>CHILD SAFETY COMMITMENT:</strong> Chat Aura is strictly directed to users aged 13 and above. We do not knowingly collect personal information from children under 13. Furthermore, we maintain an uncompromising zero-tolerance policy against Child Sexual Abuse and Exploitation (CSAE) and Child Sexual Abuse Material (CSAM).
    </div>
    <p>If we become aware that an account belongs to a child under 13, or that any user has uploaded or facilitated CSAE or CSAM, we take immediate action to permanently terminate the account, blacklist the device, and report the matter to the National Center for Missing &amp; Exploited Children (NCMEC) and appropriate law enforcement authorities. See our published <a href="/child-safety">Child Safety Standards Policy</a> for complete details.</p>

    <h2>6. Your Rights &amp; Account Deletion</h2>
    <p>You have the full right to access, rectify, or permanently delete your account and personal data at any time directly within the Chat Aura application or by visiting our <a href="/delete-account">Account Deletion page</a>.</p>

    <h2>7. Contact Us</h2>
    <p>If you have any questions or concerns regarding this Privacy Policy, our data practices, or child safety, please contact our Data Protection and Safety Desk:</p>
    <div class="contact-card">
        <strong>Chat Aura Privacy &amp; Data Protection Officer</strong><br>
        <strong>Application:</strong> Chat Aura (<code>com.chataura.app</code>)<br>
        <strong>Developer:</strong> Chat Aura (Publisher: Chat Aura / Jameel Ahamad)<br>
        <strong>Email:</strong> <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a><br>
        <strong>Official Website:</strong> <a href="https://chataura.in">https://chataura.in</a>
    </div>
  `;
  return renderLegalLayout('Privacy Policy', content);
}

export function renderDeleteAccount(): string {
  const content = `
    <p>You can delete your <strong>Chat Aura</strong> account (Package: <code>com.chataura.app</code>, Developer: <strong>Chat Aura</strong>) and all associated personal data at any time. Account deletion is fully automated, irreversible, and executed directly within the app.</p>

    <h2>How to Delete Your Account In-App</h2>
    <ol style="padding-left: 1.4rem; line-height: 1.8;">
        <li>Open the <strong>Chat Aura</strong> application on your Android device.</li>
        <li>Tap on the <strong>Profile</strong> tab (bottom-right icon).</li>
        <li>Tap the <strong>Settings</strong> gear icon.</li>
        <li>Select <strong>Account Security / Delete Account</strong>.</li>
        <li>Read the deletion warning and tap <strong>Confirm Delete Account</strong>.</li>
    </ol>

    <div class="success-box">
        <strong>Instant Automation:</strong> Account deletion does not require waiting for email support. Your profile, credentials, and associated data are purged immediately upon confirmation in the app.
    </div>

    <h2>What Data Gets Permanently Deleted</h2>
    <ul>
        <li>Your profile information, avatar, bio, phone number, and credentials.</li>
        <li>Your wallet balances (Coins, Gems) and active VIP subscriptions (non-refundable).</li>
        <li>All private chat message records and relationship bonds (CP/BCP connections).</li>
        <li>All device push tokens and active login sessions.</li>
    </ul>

    <h2>Assistance &amp; Support</h2>
    <p>If you have lost access to your device or require technical assistance with account deletion, email our support team at <a href="mailto:chataura05@gmail.com">chataura05@gmail.com</a>.</p>
  `;
  return renderLegalLayout('Delete Your Account', content);
}
