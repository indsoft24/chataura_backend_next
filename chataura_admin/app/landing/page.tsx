import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat Aura — Voice, Video & Party Rooms | Social Audio & Live Rooms',
  description:
    'Chat Aura is your ultimate social space: party rooms, 1-to-1 voice & video calls, virtual gifts, and real-time chat. Download the Android app and connect with friends.',
};

export default function LandingPage() {
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.chataura.app';

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f1f2f6] relative overflow-x-hidden font-sans">
      {/* Aurora Ambient Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 100% 80% at 50% -20%, rgba(167, 139, 250, 0.22), transparent 50%), radial-gradient(ellipse 80% 60% at 90% 30%, rgba(34, 211, 238, 0.25), transparent 45%), radial-gradient(ellipse 60% 50% at 10% 70%, rgba(251, 113, 133, 0.12), transparent 45%)',
        }}
      />

      <div className="relative z-10 max-w-[1140px] mx-auto px-6 py-4">
        {/* Navigation */}
        <header className="flex flex-wrap items-center justify-between gap-4 py-6 border-b border-white/5">
          <a href="/" className="flex items-center gap-3 no-underline text-inherit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Chat Aura Logo"
              className="w-12 h-12 rounded-xl object-contain shadow-[0_0_20px_rgba(34,211,238,0.25)]"
            />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              Chat Aura
            </span>
          </a>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-cyan-400 transition">Features</a>
            <a href="#experience" className="hover:text-cyan-400 transition">Experience</a>
            <a
              href="#download"
              className="px-4 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold hover:bg-cyan-500/25 transition"
            >
              Download App
            </a>
            <a href="/privacy-policy" className="hover:text-cyan-400 transition">Privacy</a>
            <a href="/terms-and-conditions" className="hover:text-cyan-400 transition">Terms</a>
            <a href="/child-safety" className="hover:text-cyan-400 transition">Child Safety</a>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="text-center pt-16 pb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Chat Aura App Icon"
            className="w-24 h-24 mx-auto rounded-3xl object-contain mb-6 shadow-[0_0_50px_rgba(34,211,238,0.4)] animate-pulse"
          />
          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4 bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
            Chat Aura
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-xl mx-auto mb-3">
            Where voice, video &amp; vibes connect. Party rooms, 1‑to‑1 calls, gifts, and real-time chat — all in one place.
          </p>
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-8">
            Social audio &amp; party rooms for Android
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-950 font-bold text-base shadow-[0_6px_25px_rgba(34,211,238,0.4)] hover:scale-105 transition"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.674 6.287L3.61 22.186l10.89-9.479zM5.864 2.658L16.802 8.99l-2.302 2.302-8.636-8.634zm12.712 10.994l2.387 2.386a1 1 0 01-.047 1.454l-1.54 1.267-2.387-2.386 1.54-1.267a1 1 0 011.047-.054z" />
              </svg>
              Download on Google Play
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-slate-200 font-semibold text-base hover:bg-slate-800 transition"
            >
              Explore App
            </a>
          </div>
        </section>

        {/* Screenshots Showcase Strip */}
        <section className="my-10 text-center">
          <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-thin">
            {[
              { file: '01_live_voice_party.jpg', title: 'Live Voice Party' },
              { file: '02_cp_bcp_bonds.jpg', title: 'CP & BCP Bonds' },
              { file: '03_spectacular_3d_gifts.jpg', title: 'Spectacular 3D Gifts' },
              { file: '04_lucky_77_spin_wheel.jpg', title: 'Lucky 77 & Spin Wheel' },
              { file: '05_global_leaderboard.jpg', title: 'Global Leaderboard' },
              { file: '06_private_chat_calls.jpg', title: 'Private Chat & HD Calls' },
            ].map((s, idx) => (
              <div
                key={idx}
                className="flex-shrink-0 w-60 rounded-2xl overflow-hidden shadow-2xl border border-white/10 hover:border-cyan-400 hover:-translate-y-1 transition duration-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/screenshots/${s.file}`} alt={s.title} className="w-full h-auto block" loading="lazy" />
              </div>
            ))}
          </div>
        </section>

        {/* Welcome Card */}
        <section className="max-w-3xl mx-auto my-12 p-8 rounded-2xl bg-white/[0.04] border border-white/10 text-center backdrop-blur-md shadow-xl">
          <p className="text-slate-300 text-lg leading-relaxed mb-4">
            Welcome to <strong className="text-white font-semibold">Chat Aura</strong> — your ultimate social space to connect, communicate, and enjoy real-time interactions through chat, audio calls, video calls, and live party rooms.
          </p>
          <p className="text-slate-400 leading-relaxed">
            Chat Aura is designed to bring people closer through seamless communication and engaging social experiences. Whether you want to chat privately, join fun party rooms, or interact through live audio and video calls, Chat Aura provides a smooth and secure environment for meaningful connections.
          </p>
        </section>

        {/* Features Grid */}
        <section className="py-12" id="features">
          <h2 className="text-3xl font-extrabold text-center mb-2 tracking-tight">Everything in one app</h2>
          <p className="text-slate-400 text-center max-w-xl mx-auto mb-10">
            Chat Aura brings together live rooms, crystal-clear voice and video, virtual gifts, and instant messaging.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '🎙️',
                title: 'Party rooms',
                desc: 'Create or join live rooms. Take a seat, unmute, and talk — with optional video. Host controls, themes, and room settings.',
                bg: 'from-violet-500/20 to-purple-500/10',
              },
              {
                icon: '📹',
                title: 'Voice & video calls',
                desc: 'One-to-one audio and video calls with push notifications when the app is closed. Reliable, low-latency with Agora.',
                bg: 'from-cyan-500/20 to-teal-500/10',
              },
              {
                icon: '🎁',
                title: 'Virtual gifts',
                desc: 'Send gifts in rooms or in private chat. Coins, wallet, and recharge packages. Support creators and level up your profile.',
                bg: 'from-rose-500/20 to-pink-500/10',
              },
              {
                icon: '💬',
                title: 'Real-time chat',
                desc: 'Text, emojis, and gifts in private conversations. Message status (sent, delivered, read) and FCM notifications.',
                bg: 'from-emerald-500/20 to-green-500/10',
              },
              {
                icon: '👛',
                title: 'Wallet & packages',
                desc: 'Recharge with packages, send gifts, convert gems to coins in-app. Transaction history and referral rewards.',
                bg: 'from-amber-500/20 to-yellow-500/10',
              },
              {
                icon: '✨',
                title: 'Invite & earn',
                desc: 'Share your invite code. Friends sign up, you earn. Lucky spin and room games add extra fun.',
                bg: 'from-cyan-500/20 to-violet-500/10',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/40 hover:-translate-y-1 transition duration-200 backdrop-blur"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 bg-gradient-to-br ${f.bg}`}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Experience Section */}
        <section className="py-12" id="experience">
          <h2 className="text-3xl font-extrabold text-center mb-2 tracking-tight">Designed for connection</h2>
          <p className="text-slate-400 text-center max-w-xl mx-auto mb-10">
            Every feature is built to keep you close to the people who matter.
          </p>

          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                icon: '💬',
                title: 'Smart Messaging',
                desc: 'Stay connected with your friends using our fast and simple chat system.',
                bullets: ['One-to-one private chat', 'Real-time message delivery', 'Send emojis and interactive gifts', 'Instant notifications'],
                badge: 'from-emerald-500/30 to-green-500/15',
              },
              {
                icon: '📹',
                title: 'Audio & Video Calling',
                desc: 'Experience high-quality calls anytime.',
                bullets: ['1-to-1 audio calls', '1-to-1 video calls', 'Group interaction support', 'Smooth connection and low latency'],
                badge: 'from-cyan-500/30 to-blue-500/15',
              },
              {
                icon: '🎙️',
                title: 'Live Party Rooms',
                desc: 'Join or host party rooms and socialize in real time.',
                bullets: ['Multi-user audio & video interaction', 'Live chat inside rooms', 'Gift sharing and reactions', 'Interactive experience with friends'],
                badge: 'from-violet-500/30 to-purple-500/15',
              },
              {
                icon: '🎁',
                title: 'Gifts & Fun Engagement',
                desc: 'Make conversations more exciting.',
                bullets: ['Send virtual gifts', 'Level-based experience system', 'Profile frames and rewards'],
                badge: 'from-rose-500/30 to-pink-500/15',
              },
              {
                icon: '✨',
                title: 'Personal Profile & Levels',
                desc: 'Show your personality and grow your presence.',
                bullets: ['Profile customization', 'Level progression', 'Unlock special frames and features'],
                badge: 'from-yellow-500/30 to-amber-500/15',
              },
            ].map((b, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row gap-5 p-7 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/30 transition"
              >
                <div className={`w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-2xl bg-gradient-to-br ${b.badge}`}>
                  {b.icon}
                </div>
                <div>
                  <h3 className="font-bold text-xl mb-1">{b.title}</h3>
                  <p className="text-slate-400 text-sm mb-4">{b.desc}</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-300">
                    {b.bullets.map((point, pIdx) => (
                      <li key={pIdx} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Download Section */}
        <section
          id="download"
          className="my-16 p-12 text-center rounded-3xl bg-gradient-to-b from-white/[0.04] to-cyan-500/[0.08] border border-cyan-500/20 shadow-2xl"
        >
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Download Chat Aura</h2>
          <p className="text-slate-300 max-w-lg mx-auto mb-8 text-base">
            Get the app on your Android device and start connecting with friends through chat, calls, and live party rooms.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-950 font-bold text-lg shadow-[0_6px_30px_rgba(34,211,238,0.4)] hover:scale-105 transition"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.674 6.287L3.61 22.186l10.89-9.479zM5.864 2.658L16.802 8.99l-2.302 2.302-8.636-8.634zm12.712 10.994l2.387 2.386a1 1 0 01-.047 1.454l-1.54 1.267-2.387-2.386 1.54-1.267a1 1 0 011.047-.054z" />
              </svg>
              Download on Google Play
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 pb-12 border-t border-white/5 text-center">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400 mb-4">
            <a href="/privacy-policy" className="hover:text-cyan-400 transition">Privacy Policy</a>
            <a href="/terms-and-conditions" className="hover:text-cyan-400 transition">Terms &amp; Conditions</a>
            <a href="/delete-account" className="hover:text-cyan-400 transition">Delete Account</a>
            <a href="/child-safety" className="hover:text-cyan-400 transition">Child Safety</a>
          </div>
          <p className="text-xs text-slate-500">© 2026 Chat Aura. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
