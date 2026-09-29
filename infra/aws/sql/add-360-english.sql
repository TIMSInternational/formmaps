-- =====================================================================================
-- 360 (Vocational instrument v1) — ENGLISH version of the questionnaire.
--   200 question texts ("textEn"), 136 option labels ("labelEn" inside options), 4 question scale-anchor
--   sets + 8 dimension scale-anchor sets ("scaleAnchorsEn"), 8 dimension names ("nameEn"), 1 instrument name ("nameEn").
--
-- Why: the instrument was Spanish-only ("textEn" NULL on all 200 variants), so English-language evaluators were
-- served Spanish. Both backends now resolve GET /evaluation/vocational/:token?lang=en from these columns,
-- falling back to Spanish per field while a value is missing.
--
-- Run AFTER fix-360-spanish-grammar.sql and fix-360-spanish-grammar-2.sql: every English value is guarded on the
-- exact Spanish text it translates, so a row whose Spanish is not the reviewed round-2 wording is left alone
-- (and shows up as a lower count in the NOTICE).
--
-- GENERATED from api/scripts/data/vocational-360-instrument.json (legacy repo), which carries the same English.
-- SAFE BY CONSTRUCTION:
--  * Schema: only ADD COLUMN IF NOT EXISTS for new NULLABLE columns (vocational_questions."scaleAnchorsEn",
--    vocational_dimensions."scaleAnchorsEn", vocational_instruments."nameEn"). No defaults, no rewrites.
--  * Data: English is written only where it is still NULL (re-running is a no-op; a value someone already set
--    by hand is never overwritten), matched on instrument version + question number + question group + variant.
--  * Spanish, option values, scoring rules, weights, ids and keys are never touched. Options are edited
--    element-by-element inside the jsonb (matched by "value" + the Spanish label), never replaced wholesale.
-- =====================================================================================
ALTER TABLE vocational_questions   ADD COLUMN IF NOT EXISTS "scaleAnchorsEn" jsonb;
ALTER TABLE vocational_dimensions  ADD COLUMN IF NOT EXISTS "scaleAnchorsEn" jsonb;
ALTER TABLE vocational_instruments ADD COLUMN IF NOT EXISTS "nameEn" text;

DO $$
DECLARE n_var int := 0; n_opt int := 0; n_anc int := 0; n_dim int := 0; n_danc int := 0; n_ins int := 0; c int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vocational_instruments WHERE version = 'v1') THEN
    RAISE EXCEPTION 'instrument version v1 not found — refusing';
  END IF;
  UPDATE vocational_question_variants v SET "textEn" = 'How much personal interest do I have in math, statistics, or numerical analysis?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 1 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés personal tengo por matemáticas, estadística o análisis numérico?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much interest in math, statistics, or numerical analysis have you observed in your child?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 1 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés han observado en su hijo/a por matemáticas, estadística o análisis numérico?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how much academic interest does the student show in math, statistics, or numerical analysis?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 1 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿qué tanto interés académico muestra el/la estudiante por matemáticas, estadística o análisis numérico?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday life, how much genuine interest in math, statistics, or numerical analysis do you see in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 1 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su vida cotidiana, ¿qué tanto interés real observa en el/la estudiante por matemáticas, estadística o análisis numérico?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much personal interest do I have in technology, innovation, or digital tools?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 2 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés personal tengo por tecnología, innovación o herramientas digitales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much interest in technology, innovation, or digital tools have you observed in your child?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 2 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés han observado en su hijo/a por tecnología, innovación o herramientas digitales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how much academic interest does the student show in technology, innovation, or digital tools?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 2 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿qué tanto interés académico muestra el/la estudiante por tecnología, innovación o herramientas digitales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday life, how much genuine interest in technology, innovation, or digital tools do you see in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 2 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su vida cotidiana, ¿qué tanto interés real observa en el/la estudiante por tecnología, innovación o herramientas digitales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much personal interest do I have in biological sciences, health, or medicine?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 3 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés personal tengo por ciencias biológicas, salud o medicina?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much interest in biological sciences, health, or medicine have you observed in your child?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 3 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés han observado en su hijo/a por ciencias biológicas, salud o medicina?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how much academic interest does the student show in biological sciences, health, or medicine?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 3 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿qué tanto interés académico muestra el/la estudiante por ciencias biológicas, salud o medicina?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday life, how much genuine interest in biological sciences, health, or medicine do you see in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 3 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su vida cotidiana, ¿qué tanto interés real observa en el/la estudiante por ciencias biológicas, salud o medicina?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much personal interest do I have in social, economic, or political issues?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 4 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés personal tengo por fenómenos sociales, económicos o políticos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much interest in social, economic, or political issues have you observed in your child?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 4 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés han observado en su hijo/a por fenómenos sociales, económicos o políticos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how much academic interest does the student show in social, economic, or political issues?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 4 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿qué tanto interés académico muestra el/la estudiante por fenómenos sociales, económicos o políticos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday life, how much genuine interest in social, economic, or political issues do you see in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 4 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su vida cotidiana, ¿qué tanto interés real observa en el/la estudiante por fenómenos sociales, económicos o políticos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much personal interest do I have in creative, artistic, visual, or design activities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 5 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés personal tengo por actividades creativas, artísticas, visuales o de diseño?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much interest in creative, artistic, visual, or design activities have you observed in your child?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 5 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto interés han observado en su hijo/a por actividades creativas, artísticas, visuales o de diseño?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how much academic interest does the student show in creative, artistic, visual, or design activities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 5 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿qué tanto interés académico muestra el/la estudiante por actividades creativas, artísticas, visuales o de diseño?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday life, how much genuine interest in creative, artistic, visual, or design activities do you see in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 5 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su vida cotidiana, ¿qué tanto interés real observa en el/la estudiante por actividades creativas, artísticas, visuales o de diseño?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would I rate my ability to understand mathematical, statistical, or numerical concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 6 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo evalúo mi facilidad para comprender conceptos matemáticos, estadísticos o numéricos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would you rate your child''s ability to understand mathematical, statistical, or numerical concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 6 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo valorarían la facilidad de su hijo/a para comprender conceptos matemáticos, estadísticos o numéricos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how would you rate the student''s ability to understand mathematical, statistical, or numerical concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 6 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿cómo valora la facilidad del/de la estudiante para comprender conceptos matemáticos, estadísticos o numéricos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you know, how would you rate the student''s ability to understand mathematical, statistical, or numerical concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 6 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde lo que usted conoce, ¿cómo valora la facilidad del/de la estudiante para comprender conceptos matemáticos, estadísticos o numéricos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would I rate my ability to learn scientific, technical, or technological concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 7 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo evalúo mi facilidad para aprender conceptos científicos, técnicos o tecnológicos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would you rate your child''s ability to learn scientific, technical, or technological concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 7 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo valorarían la facilidad de su hijo/a para aprender conceptos científicos, técnicos o tecnológicos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how would you rate the student''s ability to learn scientific, technical, or technological concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 7 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿cómo valora la facilidad del/de la estudiante para aprender conceptos científicos, técnicos o tecnológicos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you know, how would you rate the student''s ability to learn scientific, technical, or technological concepts?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 7 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde lo que usted conoce, ¿cómo valora la facilidad del/de la estudiante para aprender conceptos científicos, técnicos o tecnológicos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would I rate my ability to express myself clearly, both orally and in writing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 8 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo evalúo mi facilidad para expresarme con claridad de forma oral y escrita?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would you rate your child''s ability to express themselves clearly, both orally and in writing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 8 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo valorarían la facilidad de su hijo/a para expresarse con claridad de forma oral y escrita?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how would you rate the student''s ability to express themselves clearly, both orally and in writing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 8 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿cómo valora la facilidad del/de la estudiante para expresarse con claridad de forma oral y escrita?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you know, how would you rate the student''s ability to express themselves clearly, both orally and in writing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 8 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde lo que usted conoce, ¿cómo valora la facilidad del/de la estudiante para expresarse con claridad de forma oral y escrita?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would I rate my ability to analyze complex problems and propose effective solutions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 9 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo evalúo mi facilidad para analizar problemas complejos y proponer soluciones efectivas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would you rate your child''s ability to analyze complex problems and propose effective solutions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 9 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo valorarían la facilidad de su hijo/a para analizar problemas complejos y proponer soluciones efectivas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how would you rate the student''s ability to analyze complex problems and propose effective solutions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 9 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿cómo valora la facilidad del/de la estudiante para analizar problemas complejos y proponer soluciones efectivas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you know, how would you rate the student''s ability to analyze complex problems and propose effective solutions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 9 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde lo que usted conoce, ¿cómo valora la facilidad del/de la estudiante para analizar problemas complejos y proponer soluciones efectivas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would I rate my ability to combine knowledge from different areas to generate new ideas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 10 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo evalúo mi facilidad para integrar conocimientos de distintas áreas para generar nuevas ideas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How would you rate your child''s ability to combine knowledge from different areas to generate new ideas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 10 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cómo valorarían la facilidad de su hijo/a para integrar conocimientos de distintas áreas para generar nuevas ideas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your teaching experience, how would you rate the student''s ability to combine knowledge from different areas to generate new ideas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 10 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su experiencia docente, ¿cómo valora la facilidad del/de la estudiante para integrar conocimientos de distintas áreas para generar nuevas ideas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you know, how would you rate the student''s ability to combine knowledge from different areas to generate new ideas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 10 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde lo que usted conoce, ¿cómo valora la facilidad del/de la estudiante para integrar conocimientos de distintas áreas para generar nuevas ideas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do I tend to learn best through hands-on experiences, projects, or real-world cases?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 11 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia tiendo a aprender mejor mediante experiencias prácticas, proyectos o casos reales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do you notice that your child tends to learn best through hands-on experiences, projects, or real-world cases?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 11 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia observan que su hijo/a tiende a aprender mejor mediante experiencias prácticas, proyectos o casos reales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the academic setting, how often does the student tend to learn best through hands-on experiences, projects, or real-world cases?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 11 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el contexto académico, ¿con qué frecuencia el/la estudiante tiende a aprender mejor mediante experiencias prácticas, proyectos o casos reales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Outside the classroom or in everyday situations, how often do you notice that the student tends to learn best through hands-on experiences, projects, or real-world cases?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 11 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Fuera del aula o en contextos cotidianos, ¿con qué frecuencia observa que el/la estudiante tiende a aprender mejor mediante experiencias prácticas, proyectos o casos reales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do I tend to look for additional information when a topic interests me?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 12 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia tiendo a buscar información adicional cuando un tema me interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do you notice that your child tends to look for additional information when a topic interests them?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 12 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia observan que su hijo/a tiende a buscar información adicional cuando un tema le interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the academic setting, how often does the student tend to look for additional information when a topic interests them?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 12 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el contexto académico, ¿con qué frecuencia el/la estudiante tiende a buscar información adicional cuando un tema le interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Outside the classroom or in everyday situations, how often do you notice that the student tends to look for additional information when a topic interests them?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 12 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Fuera del aula o en contextos cotidianos, ¿con qué frecuencia observa que el/la estudiante tiende a buscar información adicional cuando un tema le interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do I tend to persevere when a topic or activity is difficult?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 13 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia tiendo a perseverar cuando un tema o actividad resulta difícil?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do you notice that your child tends to persevere when a topic or activity is difficult?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 13 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia observan que su hijo/a tiende a perseverar cuando un tema o actividad resulta difícil?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the academic setting, how often does the student tend to persevere when a topic or activity is difficult?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 13 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el contexto académico, ¿con qué frecuencia el/la estudiante tiende a perseverar cuando un tema o actividad resulta difícil?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Outside the classroom or in everyday situations, how often do you notice that the student tends to persevere when a topic or activity is difficult?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 13 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Fuera del aula o en contextos cotidianos, ¿con qué frecuencia observa que el/la estudiante tiende a perseverar cuando un tema o actividad resulta difícil?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do I tend to quickly learn new tools, platforms, or methods?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 14 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia tiendo a aprender rápidamente nuevas herramientas, plataformas o metodologías?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do you notice that your child tends to quickly learn new tools, platforms, or methods?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 14 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia observan que su hijo/a tiende a aprender rápidamente nuevas herramientas, plataformas o metodologías?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the academic setting, how often does the student tend to quickly learn new tools, platforms, or methods?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 14 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el contexto académico, ¿con qué frecuencia el/la estudiante tiende a aprender rápidamente nuevas herramientas, plataformas o metodologías?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Outside the classroom or in everyday situations, how often do you notice that the student tends to quickly learn new tools, platforms, or methods?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 14 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Fuera del aula o en contextos cotidianos, ¿con qué frecuencia observa que el/la estudiante tiende a aprender rápidamente nuevas herramientas, plataformas o metodologías?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do I tend to study or work without needing constant supervision?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 15 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia tiendo a estudiar o trabajar sin necesidad de supervisión constante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How often do you notice that your child tends to study or work without needing constant supervision?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 15 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Con qué frecuencia observan que su hijo/a tiende a estudiar o trabajar sin necesidad de supervisión constante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the academic setting, how often does the student tend to study or work without needing constant supervision?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 15 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el contexto académico, ¿con qué frecuencia el/la estudiante tiende a estudiar o trabajar sin necesidad de supervisión constante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Outside the classroom or in everyday situations, how often do you notice that the student tends to study or work without needing constant supervision?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 15 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Fuera del aula o en contextos cotidianos, ¿con qué frecuencia observa que el/la estudiante tiende a estudiar o trabajar sin necesidad de supervisión constante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much am I motivated by achieving ambitious goals and overcoming challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 16 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto me motiva lograr metas ambiciosas y superar retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much do you think your child is motivated by achieving ambitious goals and overcoming challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 16 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto consideran que a su hijo/a le motiva lograr metas ambiciosas y superar retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how much does the student seem to be motivated by achieving ambitious goals and overcoming challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 16 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante lograr metas ambiciosas y superar retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on what you see day to day, how much is the student motivated by achieving ambitious goals and overcoming challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 16 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según lo que usted ve en su vida diaria, ¿qué tanto le motiva al/a la estudiante lograr metas ambiciosas y superar retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much am I motivated by helping, guiding, or serving other people?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 17 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto me motiva ayudar, orientar o servir a otras personas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much do you think your child is motivated by helping, guiding, or serving other people?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 17 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto consideran que a su hijo/a le motiva ayudar, orientar o servir a otras personas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how much does the student seem to be motivated by helping, guiding, or serving other people?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 17 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante ayudar, orientar o servir a otras personas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on what you see day to day, how much is the student motivated by helping, guiding, or serving other people?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 17 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según lo que usted ve en su vida diaria, ¿qué tanto le motiva al/a la estudiante ayudar, orientar o servir a otras personas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much am I motivated by continuously learning and developing new skills?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 18 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto me motiva aprender continuamente y desarrollar nuevas capacidades?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much do you think your child is motivated by continuously learning and developing new skills?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 18 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto consideran que a su hijo/a le motiva aprender continuamente y desarrollar nuevas capacidades?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how much does the student seem to be motivated by continuously learning and developing new skills?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 18 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante aprender continuamente y desarrollar nuevas capacidades?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on what you see day to day, how much is the student motivated by continuously learning and developing new skills?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 18 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según lo que usted ve en su vida diaria, ¿qué tanto le motiva al/a la estudiante aprender continuamente y desarrollar nuevas capacidades?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much am I motivated by gaining recognition for my achievements and contributions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 19 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto me motiva obtener reconocimiento por mis logros y aportes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much do you think your child is motivated by gaining recognition for their achievements and contributions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 19 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto consideran que a su hijo/a le motiva obtener reconocimiento por sus logros y aportes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how much does the student seem to be motivated by gaining recognition for their achievements and contributions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 19 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante obtener reconocimiento por sus logros y aportes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on what you see day to day, how much is the student motivated by gaining recognition for their achievements and contributions?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 19 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según lo que usted ve en su vida diaria, ¿qué tanto le motiva al/a la estudiante obtener reconocimiento por sus logros y aportes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much am I motivated by making a positive impact on society or a community?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 20 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto me motiva generar impacto positivo en la sociedad o en una comunidad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much do you think your child is motivated by making a positive impact on society or a community?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 20 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto consideran que a su hijo/a le motiva generar impacto positivo en la sociedad o en una comunidad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how much does the student seem to be motivated by making a positive impact on society or a community?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 20 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante generar impacto positivo en la sociedad o en una comunidad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on what you see day to day, how much is the student motivated by making a positive impact on society or a community?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 20 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según lo que usted ve en su vida diaria, ¿qué tanto le motiva al/a la estudiante generar impacto positivo en la sociedad o en una comunidad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of me to connect with new people and build relationships?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 21 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en mí relacionarme con nuevas personas y construir vínculos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of your child to connect with new people and build relationships?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 21 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en su hijo/a relacionarse con nuevas personas y construir vínculos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the school environment, how characteristic is it of the student to connect with new people and build relationships?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 21 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el entorno escolar, ¿qué tan característico es en el/la estudiante relacionarse con nuevas personas y construir vínculos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the way they naturally relate to others, how characteristic is it of the student to connect with new people and build relationships?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 21 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su forma natural de relacionarse, ¿qué tan característico es en el/la estudiante relacionarse con nuevas personas y construir vínculos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of me to persuade, convince, or influence others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 22 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en mí persuadir, convencer o influir en otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of your child to persuade, convince, or influence others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 22 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en su hijo/a persuadir, convencer o influir en otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the school environment, how characteristic is it of the student to persuade, convince, or influence others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 22 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el entorno escolar, ¿qué tan característico es en el/la estudiante persuadir, convencer o influir en otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the way they naturally relate to others, how characteristic is it of the student to persuade, convince, or influence others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 22 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su forma natural de relacionarse, ¿qué tan característico es en el/la estudiante persuadir, convencer o influir en otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of me to listen actively and understand different points of view?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 23 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en mí escuchar activamente y comprender distintos puntos de vista?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of your child to listen actively and understand different points of view?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 23 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en su hijo/a escuchar activamente y comprender distintos puntos de vista?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the school environment, how characteristic is it of the student to listen actively and understand different points of view?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 23 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el entorno escolar, ¿qué tan característico es en el/la estudiante escuchar activamente y comprender distintos puntos de vista?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the way they naturally relate to others, how characteristic is it of the student to listen actively and understand different points of view?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 23 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su forma natural de relacionarse, ¿qué tan característico es en el/la estudiante escuchar activamente y comprender distintos puntos de vista?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of me to work in a team and collaborate with others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 24 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en mí trabajar en equipo y colaborar con otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of your child to work in a team and collaborate with others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 24 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en su hijo/a trabajar en equipo y colaborar con otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the school environment, how characteristic is it of the student to work in a team and collaborate with others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 24 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el entorno escolar, ¿qué tan característico es en el/la estudiante trabajar en equipo y colaborar con otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the way they naturally relate to others, how characteristic is it of the student to work in a team and collaborate with others?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 24 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su forma natural de relacionarse, ¿qué tan característico es en el/la estudiante trabajar en equipo y colaborar con otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of me to take the lead when the situation calls for it?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 25 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en mí asumir liderazgo cuando la situación lo requiere?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How characteristic is it of your child to take the lead when the situation calls for it?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 25 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan característico es en su hijo/a asumir liderazgo cuando la situación lo requiere?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the school environment, how characteristic is it of the student to take the lead when the situation calls for it?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 25 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En el entorno escolar, ¿qué tan característico es en el/la estudiante asumir liderazgo cuando la situación lo requiere?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In the way they naturally relate to others, how characteristic is it of the student to take the lead when the situation calls for it?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 25 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En su forma natural de relacionarse, ¿qué tan característico es en el/la estudiante asumir liderazgo cuando la situación lo requiere?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do I agree that I usually prefer structured, organized environments with clear rules?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 26 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo preferir ambientes estructurados, organizados y con reglas claras?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do you agree that your child usually prefers structured, organized environments with clear rules?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 26 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele preferir ambientes estructurados, organizados y con reglas claras?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In assignments, projects, or classes, to what extent do you agree that the student usually prefers structured, organized environments with clear rules?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 26 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele preferir ambientes estructurados, organizados y con reglas claras?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday activities, commitments, or projects, to what extent do you agree that the student usually prefers structured, organized environments with clear rules?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 26 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele preferir ambientes estructurados, organizados y con reglas claras?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do I agree that I usually adapt easily to change, uncertainty, or new challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 27 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo adaptarme fácilmente al cambio, la incertidumbre o los nuevos retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do you agree that your child usually adapts easily to change, uncertainty, or new challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 27 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele adaptarse fácilmente al cambio, la incertidumbre o los nuevos retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In assignments, projects, or classes, to what extent do you agree that the student usually adapts easily to change, uncertainty, or new challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 27 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele adaptarse fácilmente al cambio, la incertidumbre o los nuevos retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday activities, commitments, or projects, to what extent do you agree that the student usually adapts easily to change, uncertainty, or new challenges?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 27 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele adaptarse fácilmente al cambio, la incertidumbre o los nuevos retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do I agree that I am usually careful about details and the quality of my work?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo ser cuidadoso/a con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do you agree that your child is usually careful about details and the quality of their work?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele ser cuidadoso/a con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In assignments, projects, or classes, to what extent do you agree that the student is usually careful about details and the quality of their work?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso/a con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday activities, commitments, or projects, to what extent do you agree that the student is usually careful about details and the quality of their work?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso/a con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do I agree that I usually cope well with pressure, demanding deadlines, or workload?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 29 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo tolerar adecuadamente la presión, los plazos exigentes o la carga de trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do you agree that your child usually copes well with pressure, demanding deadlines, or workload?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 29 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele tolerar adecuadamente la presión, los plazos exigentes o la carga de trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In assignments, projects, or classes, to what extent do you agree that the student usually copes well with pressure, demanding deadlines, or workload?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 29 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele tolerar adecuadamente la presión, los plazos exigentes o la carga de trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday activities, commitments, or projects, to what extent do you agree that the student usually copes well with pressure, demanding deadlines, or workload?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 29 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele tolerar adecuadamente la presión, los plazos exigentes o la carga de trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do I agree that I usually meet commitments, responsibilities, and deadlines?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 30 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo cumplir compromisos, responsabilidades y fechas de entrega?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'To what extent do you agree that your child usually meets commitments, responsibilities, and deadlines?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 30 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele cumplir compromisos, responsabilidades y fechas de entrega?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In assignments, projects, or classes, to what extent do you agree that the student usually meets commitments, responsibilities, and deadlines?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 30 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele cumplir compromisos, responsabilidades y fechas de entrega?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In everyday activities, commitments, or projects, to what extent do you agree that the student usually meets commitments, responsibilities, and deadlines?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 30 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele cumplir compromisos, responsabilidades y fechas de entrega?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do I think I have to excel in analytical, technical, or data roles?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial considero que tengo para destacarme en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do you see in your child to excel in analytical, technical, or data roles?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial observan en su hijo/a para destacarse en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In your academic judgment, how much potential do you see in the student to excel in analytical, technical, or data roles?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your close perspective, how much potential do you think the student has to excel in analytical, technical, or data roles?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su percepción cercana, ¿qué potencial cree que tiene el/la estudiante para destacarse en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do I think I have to excel at leading teams, projects, or initiatives?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial considero que tengo para destacarme liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do you see in your child to excel at leading teams, projects, or initiatives?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial observan en su hijo/a para destacarse liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In your academic judgment, how much potential do you see in the student to excel at leading teams, projects, or initiatives?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your close perspective, how much potential do you think the student has to excel at leading teams, projects, or initiatives?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su percepción cercana, ¿qué potencial cree que tiene el/la estudiante para destacarse liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do I think I have to excel in commercial roles, sales, negotiation, or client relations?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial considero que tengo para destacarme en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do you see in your child to excel in commercial roles, sales, negotiation, or client relations?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial observan en su hijo/a para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In your academic judgment, how much potential do you see in the student to excel in commercial roles, sales, negotiation, or client relations?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your close perspective, how much potential do you think the student has to excel in commercial roles, sales, negotiation, or client relations?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su percepción cercana, ¿qué potencial cree que tiene el/la estudiante para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do I think I have to excel in creative activities, design, communication, or content creation?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial considero que tengo para destacarme en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do you see in your child to excel in creative activities, design, communication, or content creation?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial observan en su hijo/a para destacarse en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In your academic judgment, how much potential do you see in the student to excel in creative activities, design, communication, or content creation?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your close perspective, how much potential do you think the student has to excel in creative activities, design, communication, or content creation?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su percepción cercana, ¿qué potencial cree que tiene el/la estudiante para destacarse en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do I think I have to excel in research, knowledge creation, or solving complex problems?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial considero que tengo para destacarme en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential do you see in your child to excel in research, knowledge creation, or solving complex problems?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué potencial observan en su hijo/a para destacarse en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In your academic judgment, how much potential do you see in the student to excel in research, knowledge creation, or solving complex problems?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your close perspective, how much potential do you think the student has to excel in research, knowledge creation, or solving complex problems?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su percepción cercana, ¿qué potencial cree que tiene el/la estudiante para destacarse en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In my view, how well developed is my understanding of the importance of building a professional career?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada considero que está en mí la comprensión de la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you observe, how well developed is your child''s understanding of the importance of building a professional career?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada observan en su hijo/a la comprensión de la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how well developed is the student''s understanding of the importance of building a professional career?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la comprensión de la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your close relationship, how well developed is the student''s understanding of the importance of building a professional career?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la comprensión de la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In my view, how well developed is my genuine interest in pursuing higher education or specializing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollado considero que está en mí el interés genuino en continuar estudios superiores o especializarme?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you observe, how well developed is your child''s genuine interest in pursuing higher education or specializing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a el interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how well developed is the student''s genuine interest in pursuing higher education or specializing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante el interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your close relationship, how well developed is the student''s genuine interest in pursuing higher education or specializing?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante el interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In my view, how well developed is my search for information about majors, universities, scholarships, or career opportunities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada considero que está en mí la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you observe, how well developed is your child''s search for information about majors, universities, scholarships, or career opportunities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada observan en su hijo/a la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how well developed is the student''s search for information about majors, universities, scholarships, or career opportunities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your close relationship, how well developed is the student''s search for information about majors, universities, scholarships, or career opportunities?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In my view, how well developed is my exploration of future options on my own initiative?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada considero que está en mí la exploración de opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you observe, how well developed is your child''s exploration of future options on their own initiative?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollada observan en su hijo/a la exploración de opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how well developed is the student''s exploration of future options on their own initiative?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la exploración de opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your close relationship, how well developed is the student''s exploration of future options on their own initiative?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la exploración de opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In my view, how well developed is my commitment to my academic and professional life plan?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollado considero que está mi compromiso con mi proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From what you observe, how well developed is your child''s commitment to their academic and professional life plan?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a el compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'From your observation, how well developed is the student''s commitment to their academic and professional life plan?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante el compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Based on your close relationship, how well developed is the student''s commitment to their academic and professional life plan?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante el compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Rank the academic and professional areas according to the affinity you recognize in yourself:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = 'Ordena las áreas académicas y profesionales según la afinidad que reconoces en ti:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Rank the academic and professional areas according to the affinity you observe in your child:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = 'Ordenen las áreas académicas y profesionales según la afinidad que observan en su hijo/a:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Rank the academic and professional areas according to the affinity you observe in the student in the academic setting:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Ordene las áreas académicas y profesionales según la afinidad que observa en el/la estudiante desde el contexto académico:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Rank the academic and professional areas according to the affinity you observe in the student through your close relationship:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Ordene las áreas académicas y profesionales según la afinidad que observa en el/la estudiante desde su relación cercana:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the industries where you think you would have the best chance of professional success:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = 'Selecciona las industrias en las que consideras que tendrías mayor posibilidad de éxito profesional:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the industries where you see the best chance of professional success for your child:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccionen las industrias donde observan mayor posibilidad de éxito profesional para su hijo/a:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the industries where you see the best chance of professional success for the student:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional para el/la estudiante:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the industries where you see the best chance of professional success for the student:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional para el/la estudiante:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the activities you enjoy most or think you could enjoy:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = 'Selecciona las actividades que más disfrutas o crees que podrías disfrutar:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the activities you think your child enjoys most or could enjoy:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccionen las actividades que consideran que su hijo/a más disfruta o podría disfrutar:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the activities you think the student enjoys most or could enjoy:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione las actividades que considera que el/la estudiante más disfruta o podría disfrutar:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the activities you think the student enjoys most or could enjoy in real life:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione las actividades que considera que el/la estudiante más disfruta o podría disfrutar en su vida real:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the type of work you would probably enjoy most:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = 'Selecciona el tipo de trabajo que probablemente disfrutarías más:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the type of work your child would probably enjoy most:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccionen el tipo de trabajo que probablemente disfrutaría más su hijo/a:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the type of work the student would probably enjoy most:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione el tipo de trabajo que probablemente disfrutaría más el/la estudiante:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Select the type of work the student would probably enjoy most:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = 'Seleccione el tipo de trabajo que probablemente disfrutaría más el/la estudiante:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What do I consider my greatest talent, strength, or professional potential, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 45 AND q."group" IS NULL AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuál considero que es mi mayor talento, fortaleza o potencial profesional y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What do you consider your child''s greatest talent, strength, or professional potential, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 45 AND q."group" IS NULL AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuál consideran que es el mayor talento, fortaleza o potencial profesional de su hijo/a y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What do you consider the student''s greatest talent, strength, or professional potential, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 45 AND q."group" IS NULL AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuál considera que es el mayor talento, fortaleza o potencial profesional del/de la estudiante y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What do you consider the student''s greatest talent, strength, or professional potential, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 45 AND q."group" IS NULL AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuál considera que es el mayor talento, fortaleza o potencial profesional del/de la estudiante y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How clear am I that I want to pursue a university or technical degree, and how committed am I to that decision?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'self' AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan claro tengo que quiero estudiar una carrera universitaria o técnica, y qué tan comprometido/a estoy con esa decisión?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What activities, games, topics, or interests has your child spontaneously sought out since they were little?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'parent' AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué actividades, juegos, temas o intereses ha buscado espontáneamente su hijo/a desde niño/a?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In which academic area do you observe the student''s strongest performance?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher' AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿En qué área académica observa el mejor desempeño del/de la estudiante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What activities does the student do voluntarily in their free time when no one requires them to?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué actividades realiza el/la estudiante voluntariamente en su tiempo libre cuando nadie se lo exige?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How sure do I feel about the career or professional field that currently interests me?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self' AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tan seguro/a me siento sobre la carrera o área profesional que actualmente me interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'How much potential have you observed in your child in the area where they stand out most (academic, social, creative, technical, athletic, artistic, commercial, or other)?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'parent' AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tanto potencial han observado en su hijo/a en el ámbito en el que más se destaca (académico, social, creativo, técnico, deportivo, artístico, comercial u otro)?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What type of thinking is predominant in the student?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher' AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tipo de pensamiento predomina en el/la estudiante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What topics is the student passionate about, or which ones do they talk about most enthusiastically?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué temas le apasionan al/a la estudiante o sobre cuáles conversa con más entusiasmo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What worries me most about my professional future?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self' AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué aspectos me preocupan más sobre mi futuro profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What career or professional field do you think would best allow your child to develop their potential, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'parent' AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué carrera o área profesional consideran que permitiría desarrollar mejor el potencial de su hijo/a y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What level of professional potential do you see in the student to excel in higher education and working life?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'teacher' AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué nivel de potencial profesional observa en el/la estudiante para destacarse en educación superior y vida laboral?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'In what type of work or industry do you imagine the student being most successful?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿En qué tipo de trabajo o industria imagina más exitoso/a al/a la estudiante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What kind of professional life do I imagine for myself 10 years from now, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'self' AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué tipo de vida profesional imagino para mí dentro de 10 años y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What strengths do you think set your child apart from other young people their age?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'parent' AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué fortalezas consideran que diferencian a su hijo/a de otros jóvenes de su edad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What major, academic area, or career cluster would you recommend that the student explore, and why?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'teacher' AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué carrera, área académica o familia profesional le recomendaría explorar al/a la estudiante y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What do you consider the student''s main personal strength, and in what situations does it show?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuál considera que es la principal fortaleza personal del/de la estudiante y en qué situaciones se nota?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Rank the factors that most influence your professional fulfillment:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self' AND v."group" = 'self'
     AND v."textEn" IS NULL AND v."textEs" = 'Ordena lo que más influye en tu realización profesional:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What are your main concerns about your child''s professional future?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent' AND v."group" = 'parent'
     AND v."textEn" IS NULL AND v."textEs" = '¿Cuáles son sus principales preocupaciones respecto al futuro profesional de su hijo/a?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'Which skill do you consider most important for the student to strengthen to improve their success in college and in their career?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'teacher' AND v."group" = 'teacher'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué habilidad considera más importante fortalecer para mejorar el éxito universitario y profesional del/de la estudiante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEn" = 'What activity do you think would bring the student the greatest professional satisfaction and happiness?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend'
     AND v."textEn" IS NULL AND v."textEs" = '¿Qué actividad cree que le generaría mayor satisfacción y felicidad profesional al/a la estudiante?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ingenieria' AND e->>'labelEs' = 'Ingeniería' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Engineering'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ingenieria' AND e->>'labelEs' = 'Ingeniería' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnologia_y_sistemas' AND e->>'labelEs' = 'Tecnología y sistemas' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technology and IT'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnologia_y_sistemas' AND e->>'labelEs' = 'Tecnología y sistemas' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'matematicas_y_estadistica' AND e->>'labelEs' = 'Matemáticas y estadística' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Mathematics and statistics'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'matematicas_y_estadistica' AND e->>'labelEs' = 'Matemáticas y estadística' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencias_de_la_salud' AND e->>'labelEs' = 'Ciencias de la salud' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Health sciences'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencias_de_la_salud' AND e->>'labelEs' = 'Ciencias de la salud' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'psicologia' AND e->>'labelEs' = 'Psicología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Psychology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'psicologia' AND e->>'labelEs' = 'Psicología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Education'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'negocios_y_administracion' AND e->>'labelEs' = 'Negocios y administración' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Business and management'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'negocios_y_administracion' AND e->>'labelEs' = 'Negocios y administración' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'marketing_y_comunicacion' AND e->>'labelEs' = 'Marketing y comunicación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Marketing and communications'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'marketing_y_comunicacion' AND e->>'labelEs' = 'Marketing y comunicación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'finanzas_y_economia' AND e->>'labelEs' = 'Finanzas y economía' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Finance and economics'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'finanzas_y_economia' AND e->>'labelEs' = 'Finanzas y economía' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'derecho' AND e->>'labelEs' = 'Derecho' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Law'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'derecho' AND e->>'labelEs' = 'Derecho' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'arquitectura' AND e->>'labelEs' = 'Arquitectura' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Architecture'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'arquitectura' AND e->>'labelEs' = 'Arquitectura' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'diseno' AND e->>'labelEs' = 'Diseño' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Design'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'diseno' AND e->>'labelEs' = 'Diseño' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencias_sociales' AND e->>'labelEs' = 'Ciencias sociales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Social sciences'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencias_sociales' AND e->>'labelEs' = 'Ciencias sociales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'relaciones_internacionales' AND e->>'labelEs' = 'Relaciones internacionales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'International relations'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'relaciones_internacionales' AND e->>'labelEs' = 'Relaciones internacionales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurship'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'biotecnologia' AND e->>'labelEs' = 'Biotecnología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Biotechnology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'biotecnologia' AND e->>'labelEs' = 'Biotecnología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencias_ambientales' AND e->>'labelEs' = 'Ciencias ambientales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Environmental sciences'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencias_ambientales' AND e->>'labelEs' = 'Ciencias ambientales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'logistica_y_operaciones' AND e->>'labelEs' = 'Logística y operaciones' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Logistics and operations'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'logistica_y_operaciones' AND e->>'labelEs' = 'Logística y operaciones' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'produccion_audiovisual' AND e->>'labelEs' = 'Producción audiovisual' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Audiovisual production'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'produccion_audiovisual' AND e->>'labelEs' = 'Producción audiovisual' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'investigacion_cientifica' AND e->>'labelEs' = 'Investigación científica' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Scientific research'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'investigacion_cientifica' AND e->>'labelEs' = 'Investigación científica' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'banca_y_finanzas' AND e->>'labelEs' = 'Banca y finanzas' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Banking and finance'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'banca_y_finanzas' AND e->>'labelEs' = 'Banca y finanzas' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'consumo_masivo' AND e->>'labelEs' = 'Consumo masivo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Consumer goods'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'consumo_masivo' AND e->>'labelEs' = 'Consumo masivo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'consultoria' AND e->>'labelEs' = 'Consultoría' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Consulting'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'consultoria' AND e->>'labelEs' = 'Consultoría' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Health care'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Education'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'gobierno' AND e->>'labelEs' = 'Gobierno' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Government'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'gobierno' AND e->>'labelEs' = 'Gobierno' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'organismos_internacionales' AND e->>'labelEs' = 'Organismos internacionales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'International organizations'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'organismos_internacionales' AND e->>'labelEs' = 'Organismos internacionales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'marketing_y_publicidad' AND e->>'labelEs' = 'Marketing y publicidad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Marketing and advertising'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'marketing_y_publicidad' AND e->>'labelEs' = 'Marketing y publicidad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'entretenimiento' AND e->>'labelEs' = 'Entretenimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entertainment'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'entretenimiento' AND e->>'labelEs' = 'Entretenimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'deportes' AND e->>'labelEs' = 'Deportes' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Sports'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'deportes' AND e->>'labelEs' = 'Deportes' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'energia' AND e->>'labelEs' = 'Energía' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Energy'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'energia' AND e->>'labelEs' = 'Energía' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'construccion' AND e->>'labelEs' = 'Construcción' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Construction'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'construccion' AND e->>'labelEs' = 'Construcción' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'manufactura' AND e->>'labelEs' = 'Manufactura' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Manufacturing'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'manufactura' AND e->>'labelEs' = 'Manufactura' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'comercio_electronico' AND e->>'labelEs' = 'Comercio electrónico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'E-commerce'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'comercio_electronico' AND e->>'labelEs' = 'Comercio electrónico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'turismo' AND e->>'labelEs' = 'Turismo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Tourism'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'turismo' AND e->>'labelEs' = 'Turismo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'logistica' AND e->>'labelEs' = 'Logística' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Logistics'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'logistica' AND e->>'labelEs' = 'Logística' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'telecomunicaciones' AND e->>'labelEs' = 'Telecomunicaciones' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Telecommunications'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'telecomunicaciones' AND e->>'labelEs' = 'Telecomunicaciones' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'investigacion_y_desarrollo' AND e->>'labelEs' = 'Investigación y desarrollo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Research and development'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'investigacion_y_desarrollo' AND e->>'labelEs' = 'Investigación y desarrollo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurship'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'resolver_problemas_complejos' AND e->>'labelEs' = 'Resolver problemas complejos' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Solving complex problems'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'resolver_problemas_complejos' AND e->>'labelEs' = 'Resolver problemas complejos' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'liderar_personas' AND e->>'labelEs' = 'Liderar personas' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Leading people'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'liderar_personas' AND e->>'labelEs' = 'Liderar personas' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'convencer_o_negociar' AND e->>'labelEs' = 'Convencer o negociar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Persuading or negotiating'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'convencer_o_negociar' AND e->>'labelEs' = 'Convencer o negociar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'analizar_informacion' AND e->>'labelEs' = 'Analizar información' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Analyzing information'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'analizar_informacion' AND e->>'labelEs' = 'Analizar información' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'investigar' AND e->>'labelEs' = 'Investigar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Researching'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'investigar' AND e->>'labelEs' = 'Investigar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'disenar' AND e->>'labelEs' = 'Diseñar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Designing'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'disenar' AND e->>'labelEs' = 'Diseñar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'crear_contenido' AND e->>'labelEs' = 'Crear contenido' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Creating content'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'crear_contenido' AND e->>'labelEs' = 'Crear contenido' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ensenar' AND e->>'labelEs' = 'Enseñar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Teaching'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ensenar' AND e->>'labelEs' = 'Enseñar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ayudar_a_otros' AND e->>'labelEs' = 'Ayudar a otros' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Helping others'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ayudar_a_otros' AND e->>'labelEs' = 'Ayudar a otros' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'vender' AND e->>'labelEs' = 'Vender' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Selling'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'vender' AND e->>'labelEs' = 'Vender' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'programar' AND e->>'labelEs' = 'Programar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Programming'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'programar' AND e->>'labelEs' = 'Programar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'construir' AND e->>'labelEs' = 'Construir' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Building'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'construir' AND e->>'labelEs' = 'Construir' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'organizar' AND e->>'labelEs' = 'Organizar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Organizing'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'organizar' AND e->>'labelEs' = 'Organizar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'planificar' AND e->>'labelEs' = 'Planificar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Planning'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'planificar' AND e->>'labelEs' = 'Planificar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'innovar' AND e->>'labelEs' = 'Innovar' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Innovating'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'innovar' AND e->>'labelEs' = 'Innovar' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'analitico' AND e->>'labelEs' = 'Analítico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Analytical'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'analitico' AND e->>'labelEs' = 'Analítico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'creativo' AND e->>'labelEs' = 'Creativo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Creative'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'creativo' AND e->>'labelEs' = 'Creativo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'comercial' AND e->>'labelEs' = 'Comercial' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Commercial'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'comercial' AND e->>'labelEs' = 'Comercial' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnico' AND e->>'labelEs' = 'Técnico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technical'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnico' AND e->>'labelEs' = 'Técnico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'cientifico' AND e->>'labelEs' = 'Científico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Scientific'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'cientifico' AND e->>'labelEs' = 'Científico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendedor' AND e->>'labelEs' = 'Emprendedor' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurial'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendedor' AND e->>'labelEs' = 'Emprendedor' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'social' AND e->>'labelEs' = 'Social' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Social'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'social' AND e->>'labelEs' = 'Social' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'administrativo' AND e->>'labelEs' = 'Administrativo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Administrative'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'administrativo' AND e->>'labelEs' = 'Administrativo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'estrategico' AND e->>'labelEs' = 'Estratégico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Strategic'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'estrategico' AND e->>'labelEs' = 'Estratégico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'operativo' AND e->>'labelEs' = 'Operativo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Operational'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'operativo' AND e->>'labelEs' = 'Operativo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'matematicas' AND e->>'labelEs' = 'Matemáticas' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Mathematics'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'matematicas' AND e->>'labelEs' = 'Matemáticas' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencias' AND e->>'labelEs' = 'Ciencias' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Science'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencias' AND e->>'labelEs' = 'Ciencias' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'comunicacion' AND e->>'labelEs' = 'Comunicación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Communication'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'comunicacion' AND e->>'labelEs' = 'Comunicación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencias_sociales' AND e->>'labelEs' = 'Ciencias sociales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Social sciences'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencias_sociales' AND e->>'labelEs' = 'Ciencias sociales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'arte_diseno' AND e->>'labelEs' = 'Arte/diseño' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Art/design'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'arte_diseno' AND e->>'labelEs' = 'Arte/diseño' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'idiomas' AND e->>'labelEs' = 'Idiomas' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Languages'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'idiomas' AND e->>'labelEs' = 'Idiomas' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'liderazgo_proyectos' AND e->>'labelEs' = 'Liderazgo/proyectos' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Leadership/projects'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'liderazgo_proyectos' AND e->>'labelEs' = 'Liderazgo/proyectos' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'otra' AND e->>'labelEs' = 'Otra' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Other'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'otra' AND e->>'labelEs' = 'Otra' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'logico_analitico' AND e->>'labelEs' = 'Lógico-analítico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Logical-analytical'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'logico_analitico' AND e->>'labelEs' = 'Lógico-analítico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'creativo' AND e->>'labelEs' = 'Creativo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Creative'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'creativo' AND e->>'labelEs' = 'Creativo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'practico' AND e->>'labelEs' = 'Práctico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Practical'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'practico' AND e->>'labelEs' = 'Práctico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'social_comunicativo' AND e->>'labelEs' = 'Social-comunicativo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Social-communicative'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'social_comunicativo' AND e->>'labelEs' = 'Social-comunicativo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnico' AND e->>'labelEs' = 'Técnico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technical'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnico' AND e->>'labelEs' = 'Técnico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'estrategico' AND e->>'labelEs' = 'Estratégico' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Strategic'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'estrategico' AND e->>'labelEs' = 'Estratégico' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'reflexivo' AND e->>'labelEs' = 'Reflexivo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Reflective'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'reflexivo' AND e->>'labelEs' = 'Reflexivo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendedor' AND e->>'labelEs' = 'Emprendedor' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurial'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendedor' AND e->>'labelEs' = 'Emprendedor' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'negocios' AND e->>'labelEs' = 'Negocios' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Business'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'negocios' AND e->>'labelEs' = 'Negocios' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'deporte' AND e->>'labelEs' = 'Deporte' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Sports'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'deporte' AND e->>'labelEs' = 'Deporte' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'moda' AND e->>'labelEs' = 'Moda' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Fashion'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'moda' AND e->>'labelEs' = 'Moda' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'musica' AND e->>'labelEs' = 'Música' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Music'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'musica' AND e->>'labelEs' = 'Música' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'arte' AND e->>'labelEs' = 'Arte' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Art'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'arte' AND e->>'labelEs' = 'Arte' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Health'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'psicologia' AND e->>'labelEs' = 'Psicología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Psychology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'psicologia' AND e->>'labelEs' = 'Psicología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'politica' AND e->>'labelEs' = 'Política' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Politics'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'politica' AND e->>'labelEs' = 'Política' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'viajes' AND e->>'labelEs' = 'Viajes' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Travel'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'viajes' AND e->>'labelEs' = 'Viajes' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'videojuegos' AND e->>'labelEs' = 'Videojuegos' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Video games'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'videojuegos' AND e->>'labelEs' = 'Videojuegos' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'redes_sociales' AND e->>'labelEs' = 'Redes sociales' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Social media'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'redes_sociales' AND e->>'labelEs' = 'Redes sociales' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurship'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ciencia' AND e->>'labelEs' = 'Ciencia' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Science'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ciencia' AND e->>'labelEs' = 'Ciencia' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Other'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'elegir_carrera_equivocada' AND e->>'labelEs' = 'Elegir carrera equivocada' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Choosing the wrong major'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'elegir_carrera_equivocada' AND e->>'labelEs' = 'Elegir carrera equivocada' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'no_encontrar_trabajo' AND e->>'labelEs' = 'No encontrar trabajo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Not finding a job'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'no_encontrar_trabajo' AND e->>'labelEs' = 'No encontrar trabajo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'no_cumplir_expectativas_familiares' AND e->>'labelEs' = 'No cumplir expectativas familiares' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Not meeting family expectations'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'no_cumplir_expectativas_familiares' AND e->>'labelEs' = 'No cumplir expectativas familiares' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'no_saber_que_me_gusta' AND e->>'labelEs' = 'No saber qué me gusta' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Not knowing what I like'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'no_saber_que_me_gusta' AND e->>'labelEs' = 'No saber qué me gusta' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'costo_de_estudios' AND e->>'labelEs' = 'Costo de estudios' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Cost of education'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'costo_de_estudios' AND e->>'labelEs' = 'Costo de estudios' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'estudiar_fuera_del_pais' AND e->>'labelEs' = 'Estudiar fuera del país' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Studying abroad'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'estudiar_fuera_del_pais' AND e->>'labelEs' = 'Estudiar fuera del país' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'presion_academica' AND e->>'labelEs' = 'Presión académica' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Academic pressure'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'presion_academica' AND e->>'labelEs' = 'Presión académica' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'falta_de_experiencia' AND e->>'labelEs' = 'Falta de experiencia' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Lack of experience'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'falta_de_experiencia' AND e->>'labelEs' = 'Falta de experiencia' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Other'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Technology'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'tecnologia' AND e->>'labelEs' = 'Tecnología' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'banca' AND e->>'labelEs' = 'Banca' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Banking'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'banca' AND e->>'labelEs' = 'Banca' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'marketing' AND e->>'labelEs' = 'Marketing' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Marketing'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'marketing' AND e->>'labelEs' = 'Marketing' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'entretenimiento' AND e->>'labelEs' = 'Entretenimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entertainment'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'entretenimiento' AND e->>'labelEs' = 'Entretenimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Education'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'educacion' AND e->>'labelEs' = 'Educación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Health care'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'salud' AND e->>'labelEs' = 'Salud' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Entrepreneurship'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'emprendimiento' AND e->>'labelEs' = 'Emprendimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'deportes' AND e->>'labelEs' = 'Deportes' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Sports'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'deportes' AND e->>'labelEs' = 'Deportes' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'consultoria' AND e->>'labelEs' = 'Consultoría' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Consulting'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'consultoria' AND e->>'labelEs' = 'Consultoría' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'diseno' AND e->>'labelEs' = 'Diseño' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Design'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'diseno' AND e->>'labelEs' = 'Diseño' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'sector_publico' AND e->>'labelEs' = 'Sector público' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Public sector'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'sector_publico' AND e->>'labelEs' = 'Sector público' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'turismo' AND e->>'labelEs' = 'Turismo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Tourism'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'turismo' AND e->>'labelEs' = 'Turismo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Other'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ingresos' AND e->>'labelEs' = 'Ingresos' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Income'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ingresos' AND e->>'labelEs' = 'Ingresos' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'estabilidad' AND e->>'labelEs' = 'Estabilidad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Stability'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'estabilidad' AND e->>'labelEs' = 'Estabilidad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'reconocimiento' AND e->>'labelEs' = 'Reconocimiento' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Recognition'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'reconocimiento' AND e->>'labelEs' = 'Reconocimiento' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'ayudar_a_otros' AND e->>'labelEs' = 'Ayudar a otros' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Helping others'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'ayudar_a_otros' AND e->>'labelEs' = 'Ayudar a otros' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'innovacion' AND e->>'labelEs' = 'Innovación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Innovation'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'innovacion' AND e->>'labelEs' = 'Innovación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'libertad' AND e->>'labelEs' = 'Libertad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Freedom'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'libertad' AND e->>'labelEs' = 'Libertad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'prestigio' AND e->>'labelEs' = 'Prestigio' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Prestige'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'prestigio' AND e->>'labelEs' = 'Prestigio' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'aprendizaje_continuo' AND e->>'labelEs' = 'Aprendizaje continuo' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Continuous learning'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'aprendizaje_continuo' AND e->>'labelEs' = 'Aprendizaje continuo' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'falta_de_claridad' AND e->>'labelEs' = 'Falta de claridad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Lack of clarity'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'falta_de_claridad' AND e->>'labelEs' = 'Falta de claridad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'baja_motivacion' AND e->>'labelEs' = 'Baja motivación' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Low motivation'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'baja_motivacion' AND e->>'labelEs' = 'Baja motivación' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'presion_externa' AND e->>'labelEs' = 'Presión externa' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Outside pressure'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'presion_externa' AND e->>'labelEs' = 'Presión externa' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'dificultad_academica' AND e->>'labelEs' = 'Dificultad académica' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Academic difficulty'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'dificultad_academica' AND e->>'labelEs' = 'Dificultad académica' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'eleccion_poco_realista' AND e->>'labelEs' = 'Elección poco realista' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Unrealistic choice'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'eleccion_poco_realista' AND e->>'labelEs' = 'Elección poco realista' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'falta_de_disciplina' AND e->>'labelEs' = 'Falta de disciplina' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Lack of discipline'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'falta_de_disciplina' AND e->>'labelEs' = 'Falta de disciplina' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'empleabilidad' AND e->>'labelEs' = 'Empleabilidad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Employability'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'empleabilidad' AND e->>'labelEs' = 'Empleabilidad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'adaptacion_a_la_universidad' AND e->>'labelEs' = 'Adaptación a la universidad' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Adjusting to college'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'adaptacion_a_la_universidad' AND e->>'labelEs' = 'Adaptación a la universidad' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL THEN (e - 'labelEn') || jsonb_build_object('labelEn', 'Other'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND jsonb_typeof(q.options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.options) e WHERE e->>'value' = 'otro' AND e->>'labelEs' = 'Otro' AND e->>'labelEn' IS NULL);
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "scaleAnchorsEn" = '["Not at all clear / committed", "Not very clear / committed", "Moderately clear / committed", "Quite clear / committed", "Very clear / committed"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'self'
     AND (q."scaleAnchorsEn" IS NULL OR jsonb_typeof(q."scaleAnchorsEn") = 'null') AND q."scaleAnchors" = '["Nada claro / comprometido/a", "Poco claro / comprometido/a", "Moderadamente claro / comprometido/a", "Bastante claro / comprometido/a", "Muy claro / comprometido/a"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "scaleAnchorsEn" = '["Not at all sure", "Not very sure", "Moderately sure", "Quite sure", "Completely sure"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND (q."scaleAnchorsEn" IS NULL OR jsonb_typeof(q."scaleAnchorsEn") = 'null') AND q."scaleAnchors" = '["Nada seguro/a", "Poco seguro/a", "Moderadamente seguro/a", "Bastante seguro/a", "Totalmente seguro/a"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "scaleAnchorsEn" = '["Very little potential", "Limited potential", "Moderate potential", "High potential", "Exceptional potential"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'parent'
     AND (q."scaleAnchorsEn" IS NULL OR jsonb_typeof(q."scaleAnchorsEn") = 'null') AND q."scaleAnchors" = '["Muy poco potencial", "Potencial limitado", "Potencial moderado", "Alto potencial", "Potencial excepcional"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "scaleAnchorsEn" = '["Very little potential", "Limited potential", "Moderate potential", "High potential", "Exceptional potential"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'teacher'
     AND (q."scaleAnchorsEn" IS NULL OR jsonb_typeof(q."scaleAnchorsEn") = 'null') AND q."scaleAnchors" = '["Muy poco potencial", "Potencial limitado", "Potencial moderado", "Alto potencial", "Potencial excepcional"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Academic interests', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'intereses_academicos'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Intereses académicos';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["No observed interest", "Little observed interest", "Moderate interest", "High observed interest", "Very high observed interest"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'intereses_academicos'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Nada de interés observado", "Poco interés observado", "Interés moderado", "Alto interés observado", "Muy alto interés observado"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Perceived academic abilities', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'habilidades_academicas_percibidas'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Habilidades académicas percibidas';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Well below average", "Below average", "Average", "Above average", "Exceptional"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'habilidades_academicas_percibidas'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Muy por debajo del promedio", "Por debajo del promedio", "Promedio", "Superior al promedio", "Excepcional"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Approach to learning', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'forma_de_aprender'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Forma de aprender';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Never", "Rarely", "Sometimes", "Often", "Almost always"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'forma_de_aprender'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Nunca", "Rara vez", "Algunas veces", "Frecuentemente", "Casi siempre"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Personal motivators', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'motivadores_personales'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Motivadores personales';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Not at all motivating", "Slightly motivating", "Moderately motivating", "Very motivating", "Extremely motivating"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'motivadores_personales'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["No lo motiva", "Lo motiva poco", "Lo motiva moderadamente", "Lo motiva bastante", "Lo motiva muchísimo"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Relating to others', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'relacion_con_las_personas'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Relación con las personas';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Very uncharacteristic", "Not very characteristic", "Moderately characteristic", "Quite characteristic", "Very characteristic"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'relacion_con_las_personas'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Muy poco característico", "Poco característico", "Moderadamente característico", "Bastante característico", "Muy característico"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Work style', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'estilo_de_trabajo'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Estilo de trabajo';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'estilo_de_trabajo'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Totalmente en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Totalmente de acuerdo"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Perceived professional potential', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'potencial_profesional_percibido'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Potencial profesional percibido';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Very little potential", "Limited potential", "Moderate potential", "High potential", "Exceptional potential"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'potencial_profesional_percibido'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Muy poco potencial", "Potencial limitado", "Potencial moderado", "Alto potencial", "Potencial excepcional"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_dimensions d SET "nameEn" = 'Career maturity', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'madurez_para_la_vida_profesional'
     AND d."nameEn" IS NULL AND d."nameEs" = 'Madurez para la vida profesional';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "scaleAnchorsEn" = '["Not at all developed", "Slightly developed", "Moderately developed", "Well developed", "Highly developed"]'::jsonb, "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d.key = 'madurez_para_la_vida_profesional'
     AND (d."scaleAnchorsEn" IS NULL OR jsonb_typeof(d."scaleAnchorsEn") = 'null') AND d."scaleAnchors" = '["Nada desarrollado", "Poco desarrollado", "Moderadamente desarrollado", "Bien desarrollado", "Muy desarrollado"]'::jsonb;
  GET DIAGNOSTICS c = ROW_COUNT; n_danc := n_danc + c;
  UPDATE vocational_instruments SET "nameEn" = '360 vocational guidance assessment', "updatedAt" = now()
   WHERE version = 'v1' AND "nameEn" IS NULL AND name = 'Evaluación 360 de orientación vocacional';
  GET DIAGNOSTICS c = ROW_COUNT; n_ins := n_ins + c;
  RAISE NOTICE '360 English: % of 200 question texts, % of 136 option labels, % of 4 question anchor sets, % of 8 dimension anchor sets, % of 8 dimension names, % of 1 instrument name set (lower = already applied, hand-edited, or Spanish differs)', n_var, n_opt, n_anc, n_danc, n_dim, n_ins;
END
$$;
