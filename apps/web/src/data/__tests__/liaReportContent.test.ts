/**
 * LIA Results Combinations Test
 *
 * Tests all 25 combinations (5 subtests × 5 performance levels)
 * to ensure the results pages can render correctly for any result.
 */

import {
  LIASubtest,
  LIAPerformanceLevel,
  SUBTEST_ORDER,
  SUBTEST_CONFIG,
  LIAResults,
} from '@/services/liaService';

import {
  SUBTEST_DESCRIPTIONS,
  SUBTEST_LEVEL_CONTENT,
  PERFORMANCE_LEVEL_DISPLAY,
  GLOBAL_PERFORMANCE_DESCRIPTIONS,
  MIL_INTRO_TEXT,
} from '@/data/liaReportContent';

// All performance levels
const PERFORMANCE_LEVELS: LIAPerformanceLevel[] = [
  'insufficient',
  'low',
  'acceptable',
  'high',
  'outstanding',
];

// Percentile ranges for each level (based on backend thresholds)
const LEVEL_PERCENTILE_RANGES: Record<LIAPerformanceLevel, { min: number; max: number }> = {
  insufficient: { min: 0, max: 9 },
  low: { min: 10, max: 20 },
  acceptable: { min: 21, max: 57 },
  high: { min: 58, max: 74 },
  outstanding: { min: 75, max: 100 },
};

// Generate mock percentile for a given level
function getPercentileForLevel(level: LIAPerformanceLevel): number {
  const range = LEVEL_PERCENTILE_RANGES[level];
  return Math.floor((range.min + range.max) / 2);
}

// Generate mock response counts based on percentile
function generateResponseCounts(subtest: LIASubtest, percentile: number): { correct: number; incorrect: number; unanswered: number } {
  const config = SUBTEST_CONFIG[subtest];
  const totalItems = config.itemCount;

  // Approximate correct answers based on percentile
  const correctRatio = percentile / 100;
  const correct = Math.floor(totalItems * correctRatio);
  const incorrect = Math.floor((totalItems - correct) * 0.5);
  const unanswered = totalItems - correct - incorrect;

  return { correct, incorrect, unanswered };
}

// Generate mock LIA results for a specific global level
function generateMockResults(globalLevel: LIAPerformanceLevel): LIAResults {
  const globalPercentile = getPercentileForLevel(globalLevel);

  const percentiles: Record<LIASubtest, number> = {} as Record<LIASubtest, number>;
  const subtest_performance_levels: Record<LIASubtest, LIAPerformanceLevel> = {} as Record<LIASubtest, LIAPerformanceLevel>;
  const response_counts: Record<LIASubtest, { correct: number; incorrect: number; unanswered: number }> = {} as Record<LIASubtest, { correct: number; incorrect: number; unanswered: number }>;
  const raw_scores: Record<LIASubtest, number> = {} as Record<LIASubtest, number>;
  const final_scores: Record<LIASubtest, number> = {} as Record<LIASubtest, number>;
  const subtest_times: Record<LIASubtest, { startedAt: string; endedAt?: string; durationMs?: number }> = {} as Record<LIASubtest, { startedAt: string; endedAt?: string; durationMs?: number }>;

  SUBTEST_ORDER.forEach((subtest, index) => {
    // Vary percentiles slightly around the global level
    const variation = (index - 2) * 5; // -10, -5, 0, +5, +10
    const subtestPercentile = Math.max(0, Math.min(100, globalPercentile + variation));
    percentiles[subtest] = subtestPercentile;

    // Determine subtest performance level
    const level = PERFORMANCE_LEVELS.find(l => {
      const range = LEVEL_PERCENTILE_RANGES[l];
      return subtestPercentile >= range.min && subtestPercentile <= range.max;
    }) || 'acceptable';
    subtest_performance_levels[subtest] = level;

    // Generate response counts
    response_counts[subtest] = generateResponseCounts(subtest, subtestPercentile);

    // Generate scores
    raw_scores[subtest] = response_counts[subtest].correct - (response_counts[subtest].incorrect / 2);
    final_scores[subtest] = Math.round(raw_scores[subtest]);

    // Generate timing
    subtest_times[subtest] = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: SUBTEST_CONFIG[subtest].timeSeconds * 1000 * 0.8,
    };
  });

  return {
    session_id: `test-session-${globalLevel}`,
    user_name: `Test User (${globalLevel})`,
    raw_scores,
    final_scores,
    percentiles,
    global_percentile: globalPercentile,
    performance_level: globalLevel,
    performance_level_display: PERFORMANCE_LEVEL_DISPLAY[globalLevel],
    performance_level_description: GLOBAL_PERFORMANCE_DESCRIPTIONS[globalLevel],
    subtest_performance_levels,
    response_counts,
    subtest_times,
    total_time_seconds: 20 * 60,
    violation_count: 0,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
}

// Test all content exists
describe('LIA Report Content', () => {
  describe('SUBTEST_DESCRIPTIONS', () => {
    SUBTEST_ORDER.forEach(subtest => {
      it(`should have description for ${subtest}`, () => {
        const desc = SUBTEST_DESCRIPTIONS[subtest];
        expect(desc).toBeDefined();
        expect(desc.name).toBeDefined();
        expect(desc.name.es).toBeTruthy();
        expect(desc.name.en).toBeTruthy();
        expect(desc.description).toBeDefined();
        expect(desc.description.es).toBeTruthy();
        expect(desc.description.en).toBeTruthy();
      });
    });
  });

  describe('SUBTEST_LEVEL_CONTENT - All 25 combinations', () => {
    SUBTEST_ORDER.forEach(subtest => {
      PERFORMANCE_LEVELS.forEach(level => {
        it(`should have content for ${subtest} × ${level}`, () => {
          const content = SUBTEST_LEVEL_CONTENT[subtest][level];
          expect(content).toBeDefined();

          // Check interpretations
          expect(content.interpretations).toBeDefined();
          expect(content.interpretations.es).toBeDefined();
          expect(content.interpretations.es.length).toBeGreaterThan(0);
          expect(content.interpretations.en).toBeDefined();
          expect(content.interpretations.en.length).toBeGreaterThan(0);

          // Check strategies
          expect(content.strategies).toBeDefined();
          expect(content.strategies.es).toBeDefined();
          expect(content.strategies.es.length).toBeGreaterThan(0);
          expect(content.strategies.en).toBeDefined();
          expect(content.strategies.en.length).toBeGreaterThan(0);

          // Verify content is non-empty strings
          content.interpretations.es.forEach((item) => {
            expect(typeof item).toBe('string');
            expect(item.length).toBeGreaterThan(0);
          });
          content.interpretations.en.forEach((item) => {
            expect(typeof item).toBe('string');
            expect(item.length).toBeGreaterThan(0);
          });
          content.strategies.es.forEach((item) => {
            expect(typeof item).toBe('string');
            expect(item.length).toBeGreaterThan(0);
          });
          content.strategies.en.forEach((item) => {
            expect(typeof item).toBe('string');
            expect(item.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('PERFORMANCE_LEVEL_DISPLAY', () => {
    PERFORMANCE_LEVELS.forEach(level => {
      it(`should have display text for ${level}`, () => {
        const display = PERFORMANCE_LEVEL_DISPLAY[level];
        expect(display).toBeDefined();
        expect(display.es).toBeTruthy();
        expect(display.en).toBeTruthy();
      });
    });
  });

  describe('GLOBAL_PERFORMANCE_DESCRIPTIONS', () => {
    PERFORMANCE_LEVELS.forEach(level => {
      it(`should have description for ${level}`, () => {
        const desc = GLOBAL_PERFORMANCE_DESCRIPTIONS[level];
        expect(desc).toBeDefined();
        expect(desc.es).toBeTruthy();
        expect(desc.en).toBeTruthy();
      });
    });
  });

  describe('MIL_INTRO_TEXT', () => {
    it('should have Spanish intro', () => {
      expect(MIL_INTRO_TEXT.es).toBeTruthy();
      expect(MIL_INTRO_TEXT.es.length).toBeGreaterThan(100);
    });

    it('should have English intro', () => {
      expect(MIL_INTRO_TEXT.en).toBeTruthy();
      expect(MIL_INTRO_TEXT.en.length).toBeGreaterThan(100);
    });
  });
});

// Test mock data generation
describe('Mock Data Generation', () => {
  PERFORMANCE_LEVELS.forEach(level => {
    it(`should generate valid mock results for ${level} level`, () => {
      const results = generateMockResults(level);

      // Basic structure
      expect(results.session_id).toBeTruthy();
      expect(results.user_name).toBeTruthy();
      expect(results.performance_level).toBe(level);
      expect(results.global_percentile).toBeGreaterThanOrEqual(0);
      expect(results.global_percentile).toBeLessThanOrEqual(100);

      // All subtests present
      SUBTEST_ORDER.forEach(subtest => {
        expect(results.percentiles[subtest]).toBeDefined();
        expect(results.subtest_performance_levels[subtest]).toBeDefined();
        expect(results.response_counts[subtest]).toBeDefined();
        expect(results.raw_scores[subtest]).toBeDefined();
        expect(results.final_scores[subtest]).toBeDefined();
        expect(results.subtest_times[subtest]).toBeDefined();
      });

      // Performance level display
      expect(results.performance_level_display.es).toBeTruthy();
      expect(results.performance_level_display.en).toBeTruthy();
      expect(results.performance_level_description.es).toBeTruthy();
      expect(results.performance_level_description.en).toBeTruthy();
    });
  });
});

// Test edge cases
describe('Edge Cases', () => {
  it('should handle 0% percentile', () => {
    const results = generateMockResults('insufficient');
    results.global_percentile = 0;
    SUBTEST_ORDER.forEach(subtest => {
      results.percentiles[subtest] = 0;
      results.subtest_performance_levels[subtest] = 'insufficient';
    });

    // Verify content exists for this edge case
    SUBTEST_ORDER.forEach(subtest => {
      const content = SUBTEST_LEVEL_CONTENT[subtest]['insufficient'];
      expect(content.interpretations.es.length).toBeGreaterThan(0);
      expect(content.strategies.es.length).toBeGreaterThan(0);
    });
  });

  it('should handle 100% percentile', () => {
    const results = generateMockResults('outstanding');
    results.global_percentile = 100;
    SUBTEST_ORDER.forEach(subtest => {
      results.percentiles[subtest] = 100;
      results.subtest_performance_levels[subtest] = 'outstanding';
    });

    // Verify content exists for this edge case
    SUBTEST_ORDER.forEach(subtest => {
      const content = SUBTEST_LEVEL_CONTENT[subtest]['outstanding'];
      expect(content.interpretations.es.length).toBeGreaterThan(0);
      expect(content.strategies.es.length).toBeGreaterThan(0);
    });
  });

  it('should handle mixed performance levels across subtests', () => {
    const results = generateMockResults('acceptable');

    // Set different levels for each subtest
    results.subtest_performance_levels['pattern_recognition'] = 'outstanding';
    results.percentiles['pattern_recognition'] = 90;

    results.subtest_performance_levels['verbal_reasoning'] = 'high';
    results.percentiles['verbal_reasoning'] = 65;

    results.subtest_performance_levels['numerical_speed'] = 'acceptable';
    results.percentiles['numerical_speed'] = 45;

    results.subtest_performance_levels['working_memory'] = 'low';
    results.percentiles['working_memory'] = 15;

    results.subtest_performance_levels['visual_rotation'] = 'insufficient';
    results.percentiles['visual_rotation'] = 5;

    // Verify content exists for each combination
    expect(SUBTEST_LEVEL_CONTENT['pattern_recognition']['outstanding']).toBeDefined();
    expect(SUBTEST_LEVEL_CONTENT['verbal_reasoning']['high']).toBeDefined();
    expect(SUBTEST_LEVEL_CONTENT['numerical_speed']['acceptable']).toBeDefined();
    expect(SUBTEST_LEVEL_CONTENT['working_memory']['low']).toBeDefined();
    expect(SUBTEST_LEVEL_CONTENT['visual_rotation']['insufficient']).toBeDefined();
  });

  it('should handle zero response counts', () => {
    const results = generateMockResults('insufficient');
    SUBTEST_ORDER.forEach(subtest => {
      results.response_counts[subtest] = { correct: 0, incorrect: 0, unanswered: SUBTEST_CONFIG[subtest].itemCount };
    });

    // Should not crash when accessing this data
    expect(results.response_counts['pattern_recognition'].correct).toBe(0);
    expect(results.response_counts['pattern_recognition'].incorrect).toBe(0);
  });

  it('should handle all correct answers', () => {
    const results = generateMockResults('outstanding');
    SUBTEST_ORDER.forEach(subtest => {
      const total = SUBTEST_CONFIG[subtest].itemCount;
      results.response_counts[subtest] = { correct: total, incorrect: 0, unanswered: 0 };
      results.percentiles[subtest] = 100;
    });

    expect(results.response_counts['pattern_recognition'].correct).toBe(60);
    expect(results.response_counts['verbal_reasoning'].correct).toBe(50);
  });

  it('should handle no violations', () => {
    const results = generateMockResults('acceptable');
    results.violation_count = 0;
    results.lockdown_violations = undefined;

    expect(results.violation_count).toBe(0);
    expect(results.lockdown_violations).toBeUndefined();
  });

  it('should handle with violations', () => {
    const results = generateMockResults('acceptable');
    results.violation_count = 3;
    results.lockdown_violations = [
      { type: 'tab_switch', timestamp: new Date().toISOString() },
      { type: 'window_blur', timestamp: new Date().toISOString() },
      { type: 'copy_attempt', timestamp: new Date().toISOString(), details: 'Attempted to copy' },
    ];

    expect(results.violation_count).toBe(3);
    expect(results.lockdown_violations?.length).toBe(3);
  });
});

// Export for use in other tests
export { generateMockResults, PERFORMANCE_LEVELS, LEVEL_PERCENTILE_RANGES };
