// Ready-made starter messages, grouped by what a tuition centre actually sends.
// Each one uses plain {Named Tags}; "Use this" drops it into the builder where the
// teacher can tweak a few words and save. No approval, no {{1}} syntax.
//
// item: { slug, title, category, header_type, body, desc }
//   slug  → stored template name (lowercase, underscores, unique-ish)
//   body  → message with {Named Tags}

export const TEMPLATE_LIBRARY = [
  {
    category: 'Admissions',
    emoji: '🎓',
    items: [
      {
        slug: 'admission_confirmation', title: 'Admission Confirmation',
        category: 'utility', header_type: 'none',
        desc: 'Confirm a new student has joined.',
        body: "Welcome to {Institute Name}! 🎉\n\nWe're glad to confirm {Student Name}'s admission to {Class}. Login details will be shared shortly.\n\nReply to this message anytime you need help.",
      },
      {
        slug: 'welcome_message', title: 'Welcome Message',
        category: 'utility', header_type: 'none',
        desc: 'A warm hello with the Student ID.',
        body: "Hello! Welcome to {Institute Name}, {Student Name}. 👋\n\nYour Student ID is {Student ID}. You can log in here: {Login Link}\n\nWe're excited to have you with us!",
      },
    ],
  },
  {
    category: 'Fees',
    emoji: '💳',
    items: [
      {
        slug: 'fee_reminder', title: 'Fee Reminder',
        category: 'utility', header_type: 'none',
        desc: 'Remind a parent about a pending fee.',
        body: "Dear Parent, a gentle reminder that the fee of ₹{Fee Amount} for {Student Name} ({Class}) is due on {Due Date}.\n\nKindly pay before the due date. Thank you,\n{Institute Name}",
      },
      {
        slug: 'payment_received', title: 'Payment Received',
        category: 'utility', header_type: 'none',
        desc: 'Confirm a fee payment.',
        body: "Thank you! ✅ We've received the fee payment of ₹{Fee Amount} for {Student Name}.\n\nRegards,\n{Institute Name}",
      },
    ],
  },
  {
    category: 'Classes',
    emoji: '📅',
    items: [
      {
        slug: 'class_reminder', title: 'Class Reminder',
        category: 'utility', header_type: 'none',
        desc: 'Remind about an upcoming class.',
        body: "Reminder: {Student Name} has a class on {Class Date} at {Class Time}.\n\nPlease be on time. — {Institute Name}",
      },
      {
        slug: 'class_rescheduled', title: 'Class Rescheduled',
        category: 'utility', header_type: 'none',
        desc: 'Inform about a changed class time.',
        body: "Notice: The class for {Class} has been rescheduled to {Class Date} at {Class Time}.\n\nSorry for the short notice. — {Institute Name}",
      },
    ],
  },
  {
    category: 'Exams',
    emoji: '📝',
    items: [
      {
        slug: 'exam_notification', title: 'Exam Notification',
        category: 'utility', header_type: 'none',
        desc: 'Announce an upcoming exam.',
        body: "Dear Parent, {Student Name} has an upcoming exam — {Latest Exam} on {Class Date}.\n\nPlease ensure they are well prepared. — {Institute Name}",
      },
      {
        slug: 'result_published', title: 'Result Published',
        category: 'utility', header_type: 'document',
        desc: 'Share an exam result.',
        body: "Results are out! 📊 {Student Name} scored {Score} in {Latest Exam}.\n\nWell done on the effort! — {Institute Name}",
      },
    ],
  },
  {
    category: 'Attendance',
    emoji: '📌',
    items: [
      {
        slug: 'absent_alert', title: 'Absent Alert',
        category: 'utility', header_type: 'none',
        desc: 'Notify a parent of an absence.',
        body: "Dear Parent, {Student Name} was marked absent today ({Date}).\n\nIf this is unexpected, please contact us. — {Institute Name}",
      },
      {
        slug: 'attendance_warning', title: 'Attendance Warning',
        category: 'utility', header_type: 'none',
        desc: 'Flag low attendance.',
        body: "Attention: {Student Name}'s attendance is currently {Attendance}.\n\nRegular attendance really helps. — {Institute Name}",
      },
    ],
  },
  {
    category: 'General',
    emoji: '💬',
    items: [
      {
        slug: 'login_details', title: 'Login Details',
        category: 'utility', header_type: 'none',
        desc: 'Send a student their login info.',
        body: "Welcome to {Institute Name}! 🔑\n\nLogin details for {Student Name}:\nStudent ID: {Student ID}\nPassword: {Password}\nLog in here: {Login Link}",
      },
      {
        slug: 'holiday_notice', title: 'Holiday Notice',
        category: 'utility', header_type: 'none',
        desc: 'Announce a holiday / closure.',
        body: "Dear Parent, {Institute Name} will remain closed on {Class Date}. Classes resume the next working day.\n\nThank you!",
      },
    ],
  },
];
