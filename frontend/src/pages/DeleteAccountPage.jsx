import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../store';

// Public account/data deletion page — required by Google Play for apps that let
// users have accounts (the Data safety form's "delete account URL"). Reachable at
// /delete-account without auth. Deletion is handled on request (accounts are
// created by the teacher; there is no self-service login required to ask).

const CONTACT_EMAIL = 'udayatuitionhome@gmail.com';
const LAST_UPDATED = 'July 2026';
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Delete my account')}` +
  `&body=${encodeURIComponent('Please delete my account and associated data.\n\nStudent ID: \nStudent name & class: \nI confirm I am the student or their parent/guardian.')}`;

export default function DeleteAccountPage() {
  const { lmsName } = useSettingsStore();
  const name = lmsName || 'Udaya Learn';

  useEffect(() => { document.title = `Delete your account · ${name}`; }, [name]);

  const S = ({ title, children }) => (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ fontSize: 15.5, lineHeight: 1.7, color: '#374151' }}>{children}</div>
    </section>
  );
  const Li = ({ children }) => <li style={{ marginBottom: 6 }}>{children}</li>;

  return (
    <div style={{ minHeight: '100dvh', background: '#FAFAF9', color: '#374151', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 760, margin: '0 auto', padding: '40px clamp(18px,5vw,40px) 80px' }}
      >
        <a href="/app" style={{ fontSize: 14, fontWeight: 600, color: '#6A3CFF', textDecoration: 'none' }}>← Back to {name}</a>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#111827', margin: '20px 0 6px' }}>Delete your account and data</h1>
        <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Last updated: {LAST_UPDATED}</p>

        <p style={{ fontSize: 15.5, lineHeight: 1.7, marginTop: 22 }}>
          {name} is a private tuition learning app. Student accounts are created and managed by the
          teacher/institution. This page explains how a student, or their parent/guardian, can request
          deletion of the account and its associated data.
        </p>

        <S title="How to request deletion">
          Email us at the address below and include the following so we can find and verify the
          correct account:
          <ul style={{ paddingLeft: 22, marginTop: 10 }}>
            <Li>The <strong>Student ID</strong> (for example <code>25UDAYA100001</code>), or the student’s full name and class/standard.</Li>
            <Li>A short note confirming you are the student or their parent/guardian.</Li>
          </ul>
          <a
            href={MAILTO}
            style={{ display: 'inline-block', marginTop: 12, background: '#6A3CFF', color: '#fff', fontWeight: 600, textDecoration: 'none', padding: '12px 20px', borderRadius: 10 }}
          >
            Email us to delete your account
          </a>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
            Or email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#6A3CFF', fontWeight: 600 }}>{CONTACT_EMAIL}</a> directly.
          </div>
        </S>

        <S title="What gets deleted">
          On a verified request we permanently delete the account and its personal data, including:
          <ul style={{ paddingLeft: 22, marginTop: 10 }}>
            <Li>Account &amp; profile: name, phone number, login identifier and profile photo.</Li>
            <Li>Academic data: test scores and marks, attendance records and assignment submissions.</Li>
            <Li>Learning activity and any files you uploaded (for example assignment files and photos).</Li>
            <Li>The device identifier used for single-device login and the push-notification token.</Li>
          </ul>
        </S>

        <S title="What may be retained">
          We may retain a limited amount of information where retention is required by law, or to
          resolve disputes and prevent misuse. Any retained data is kept only for as long as necessary
          and is then deleted. We do not sell your personal data or use it for third-party advertising.
        </S>

        <S title="Timeframe">
          We action verified deletion requests within <strong>30 days</strong>. If we need more
          information to verify the request, we will contact you at the email address you wrote from.
        </S>

        <S title="Contact">
          Questions? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#6A3CFF', fontWeight: 600 }}>{CONTACT_EMAIL}</a>.
          {' '}See also our <a href="/privacy" style={{ color: '#6A3CFF', fontWeight: 600 }}>Privacy Policy</a>.
        </S>
      </motion.div>
    </div>
  );
}
