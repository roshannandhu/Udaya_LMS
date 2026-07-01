import React, { useEffect } from 'react';
import { useSettingsStore } from '../store';

// Public privacy policy for the Udaya student app — required by Google Play (the
// listing's "Privacy policy" field must point to a public URL). Reachable at
// /privacy without auth. Content reflects what the app ACTUALLY collects (verified
// against the students schema + main.py): account identity, learning activity,
// a device identifier for single-device login, and a push token. No analytics or
// advertising SDKs are used. Keep this accurate — Google rejects mismatched claims.

const CONTACT_EMAIL = 'udayatuitionhome@gmail.com';
const LAST_UPDATED = 'July 2026';

export default function PrivacyPolicyPage() {
  const { lmsName } = useSettingsStore();
  const name = lmsName || 'Udaya Learn';

  useEffect(() => { document.title = `Privacy Policy · ${name}`; }, [name]);

  const S = ({ title, children }) => (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ fontSize: 15.5, lineHeight: 1.7, color: '#374151' }}>{children}</div>
    </section>
  );
  const Li = ({ children }) => <li style={{ marginBottom: 6 }}>{children}</li>;

  return (
    <div style={{ minHeight: '100dvh', background: '#FAFAF9', color: '#374151', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px clamp(18px,5vw,40px) 80px' }}>
        <a href="/app" style={{ fontSize: 14, fontWeight: 600, color: '#6A3CFF', textDecoration: 'none' }}>← Back to {name}</a>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#111827', margin: '20px 0 6px' }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Last updated: {LAST_UPDATED}</p>

        <p style={{ fontSize: 15.5, lineHeight: 1.7, marginTop: 22 }}>
          {name} (“we”, “us”, “our”) is a private tuition learning app operated by an individual
          tutor. This policy explains what information the {name} app collects, how it is used, and
          the choices you have. By using the app you agree to this policy.
        </p>

        <S title="Who can use the app">
          The {name} app is intended for students aged 13 and above. It is not directed to children
          under 13, and we do not knowingly collect information from children under 13. Student
          accounts are created by the teacher; students cannot self-register.
        </S>

        <S title="Information we collect">
          We only collect what is needed to run the tuition service:
          <ul style={{ paddingLeft: 22, marginTop: 10 }}>
            <Li><strong>Account &amp; identity</strong> — student name, Student ID, and login credentials.</Li>
            <Li><strong>Contact details</strong> — email address, phone number, and a parent/guardian
              phone number, where provided, so the teacher can share updates.</Li>
            <Li><strong>Profile photo</strong> — an optional avatar image.</Li>
            <Li><strong>Learning activity</strong> — attendance, test scores, points/leaderboard
              ranking, and which lessons you have watched.</Li>
            <Li><strong>Device &amp; security data</strong> — a device identifier used to enforce the
              single-device login rule, and a push-notification token so we can send class alerts.</Li>
          </ul>
          We do <strong>not</strong> use any advertising or analytics tracking SDKs, we do not collect
          your location, and we do not build advertising profiles.
        </S>

        <S title="How we use your information">
          <ul style={{ paddingLeft: 22, marginTop: 4 }}>
            <Li>To create and manage your student account and authenticate logins.</Li>
            <Li>To deliver lessons, tests, results, and your leaderboard ranking.</Li>
            <Li>To enforce single-device login for account security.</Li>
            <Li>To send class announcements and push notifications.</Li>
            <Li>To send class updates to a parent/guardian phone number (including via WhatsApp) where one is provided.</Li>
          </ul>
        </S>

        <S title="How information is shared">
          We do not sell your personal information and we do not share it for advertising. We use a
          small number of trusted service providers purely to operate the app:
          <ul style={{ paddingLeft: 22, marginTop: 10 }}>
            <Li><strong>Supabase</strong> — secure database and authentication.</Li>
            <Li><strong>Cloudflare</strong> — content delivery and video hosting.</Li>
            <Li><strong>Google Firebase Cloud Messaging</strong> — push notifications.</Li>
            <Li><strong>WhatsApp / Meta</strong> — delivery of class updates to a parent’s phone, where used.</Li>
          </ul>
          We may also disclose information if required by law.
        </S>

        <S title="Data security">
          Information is transmitted over encrypted HTTPS connections and stored with our service
          providers under their security controls. No method of transmission or storage is 100%
          secure, but we take reasonable measures to protect your data.
        </S>

        <S title="Data retention &amp; deletion">
          We keep your information while your student account is active. Your teacher can edit or
          delete your account at any time. To request access to, correction of, or deletion of your
          personal data, email us at the address below and we will act on the request within a
          reasonable time.
        </S>

        <S title="Your choices">
          You can ask your teacher to update your details, decline to provide an optional profile
          photo, and turn off push notifications in your device settings.
        </S>

        <S title="Changes to this policy">
          We may update this policy from time to time. Material changes will be reflected by updating
          the “Last updated” date above.
        </S>

        <S title="Contact us">
          Questions about this policy or your data? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#6A3CFF', fontWeight: 600 }}>{CONTACT_EMAIL}</a>.
        </S>
      </div>
    </div>
  );
}
