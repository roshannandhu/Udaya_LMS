// Shared defaults for one-click "send exam results to all parents".
// Used by the Pending Actions card and the test Results-sheet nudge so every
// quick send produces the same score-banded advice + PDF that the Progress
// Reports tab would, with zero configuration.

// Friendly, adaptive bands so the message varies by score automatically.
export const DEFAULT_BANDS = [
  { min: 0,  max: 20,   message: 'Your child needs extra focus — let’s work together to improve.', attach_report: true },
  { min: 20, max: 50,   message: 'Your child is doing okay, with room to grow. Keep encouraging them!', attach_report: true },
  { min: 50, max: null, message: 'Your child is performing well. Thank you for your support!', attach_report: true },
];

export const DEFAULT_REPORT_MESSAGE = 'Please find your child’s report attached.';

// The standard payload for POST /send-reports for one exam → all eligible parents.
export const examResultsPayload = (testId) => ({
  test_id: testId,
  report_format: 'pdf',
  period: 'overall',
  criteria: DEFAULT_BANDS,
  default_message: DEFAULT_REPORT_MESSAGE,
  category: 'utility',
  mode: 'template',
});
