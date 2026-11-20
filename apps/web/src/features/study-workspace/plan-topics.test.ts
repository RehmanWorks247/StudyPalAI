import { describe, expect, it } from 'vitest';
import { planTopics, scheduledDate } from './plan-topics';

describe('source-based study planning', () => {
  it('groups explanations under their headings and saves stable identifiers per source', () => {
    const source = {
      name: 'My lecture.md',
      text: '# Measurement\n\nDescribe an instrument reading.\n\n# Graphs\n\nPlot the readings on both axes.',
    };
    const topics = planTopics([source]);
    expect(topics.map((t) => t.title)).toEqual(['Measurement', 'Graphs']);
    expect(topics[0]?.text).toContain('instrument reading');
    expect(planTopics([{ name: 'Other.txt', text: 'Another topic' }, source]).slice(1)).toEqual(
      topics,
    );
  });
  it('keeps the last section when a source has hundreds of topics', () => {
    const paragraphs = Array.from(
      { length: 260 },
      (_, i) => '# Experiment ' + i + '\n\nRecord the observed outcome.',
    );
    const topics = planTopics([{ name: 'semester.md', text: paragraphs.join('\n\n') }]);
    expect(topics.length).toBeLessThanOrEqual(80);
    expect(topics.at(-1)?.text).toContain('Experiment 259');
  });
  it('spreads a plan across the dates including the deadline', () => {
    expect(scheduledDate('2026-11-10', '2026-11-16', 1, 3)).toBe('2026-11-13');
    expect(scheduledDate('2026-11-10', '2026-11-16', 2, 3)).toBe('2026-11-16');
    expect(scheduledDate('2026-11-10', '2026-11-10', 1, 2)).toBe('2026-11-10');
  });
});
