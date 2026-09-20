import { describe, it, expect } from 'vitest';
import { renderTemplate, templateTokens } from './notificationTemplate';

describe('renderTemplate', () => {
  it('fills every token from the context', () => {
    expect(renderTemplate('Payment {ref} approved at {stage} by {actor}', { ref: '#12', stage: 'Finance', actor: 'Asha' }))
      .toBe('Payment #12 approved at Finance by Asha');
  });

  it('renders a missing token empty, never as raw template syntax', () => {
    expect(renderTemplate('Rejected: {reason}', {})).toBe('Rejected:');
    expect(renderTemplate('File {ref} cancelled — {reason}', { ref: 'NMI-1' })).toBe('File NMI-1 cancelled');
  });

  it('prints numbers and leaves literal text alone', () => {
    expect(renderTemplate('{count} files', { count: 3 })).toBe('3 files');
    expect(renderTemplate('No tokens here.', { ref: 'x' })).toBe('No tokens here.');
  });
});

describe('templateTokens', () => {
  it('lists each token once, in order', () => {
    expect(templateTokens('{ref} by {actor} for {ref}')).toEqual(['ref', 'actor']);
  });
});
