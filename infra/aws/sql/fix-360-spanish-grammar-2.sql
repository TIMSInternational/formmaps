-- =====================================================================================
-- 360 (Vocational instrument v1) — Spanish grammar fixes, ROUND 2 (after fix-360-spanish-grammar.sql).
--   39 question texts, 89 option labels, 5 scale anchors, 8 dimension names, 1 instrument name.
--
-- What this fixes (full audit of all 200 live variants, 2026-09-29):
--  * q36–q40: "¿Qué tan desarrollado … comprender / tener interés / buscar …?" put an infinitive where a
--    noun is required. Now "la comprensión de…", "el interés genuino en…", "la búsqueda de…", etc.
--  * Parent variants mixed "Ordene/Seleccione" (usted) with "observan/consideran" (ustedes) → plural.
--  * q47 parent: "sus mayores talentos: académico, social…" (agreement + ambiguous "sus").
--  * Items whose "su" / "lo/la" / "motivarle" had no referent now name "su hijo/a" or "el/la estudiante".
--  * Option labels, scale anchors, dimension and instrument names: Spanish sentence case (RAE),
--    first letter capitalised consistently; q47 self anchors "seguro" → "seguro/a" to match the stem.
--
-- NOT changed (item content — for TIMS): q47 parent asks "which area" on a 1–5 potential scale; q50 parent
-- asks for one concern but is multi-select; q46 self anchors add "comprometido"; self variants of
-- q41–q44/q50 start with "Ordene/Seleccione" (usted) before first-person content.
--
-- GENERATED from api/scripts/data/vocational-360-instrument.json (legacy repo), which carries the same edits.
-- SAFE BY CONSTRUCTION — same contract as round 1:
--  * Every UPDATE matches the EXACT old text (and instrument version + question number + group).
--    Re-running is a no-op; a row someone already edited by hand is left alone.
--  * Text only: no value, scoring rule, weight, id or key changes (the generator refuses otherwise).
--    Options/anchors are edited element-by-element inside the jsonb, never replaced wholesale.
-- =====================================================================================
DO $$
DECLARE n_var int := 0; n_opt int := 0; n_anc int := 0; n_dim int := 0; n_ins int := 0; c int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vocational_instruments WHERE version = 'v1') THEN
    RAISE EXCEPTION 'instrument version v1 not found — refusing';
  END IF;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante lograr metas ambiciosas y superar retos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 16 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle lograr metas ambiciosas y superar retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante ayudar, orientar o servir a otras personas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 17 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle ayudar, orientar o servir a otras personas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante aprender continuamente y desarrollar nuevas capacidades?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 18 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle aprender continuamente y desarrollar nuevas capacidades?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante obtener reconocimiento por sus logros y aportes?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 19 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle obtener reconocimiento por sus logros y aportes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tanto parece motivarle al/a la estudiante generar impacto positivo en la sociedad o en una comunidad?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 20 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tanto parece motivarle generar impacto positivo en la sociedad o en una comunidad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada observan en su hijo/a la comprensión de la importancia de construir una carrera profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a comprender la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada considero que está en mí la comprensión de la importancia de construir una carrera profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que está en mí comprender la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la comprensión de la importancia de construir una carrera profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante comprender la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la comprensión de la importancia de construir una carrera profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante comprender la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado observan en su hijo/a el interés genuino en continuar estudios superiores o especializarse?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a tener interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está en mí el interés genuino en continuar estudios superiores o especializarme?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que está en mí tener interés genuino en continuar estudios superiores o especializarme?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante el interés genuino en continuar estudios superiores o especializarse?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante tener interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante el interés genuino en continuar estudios superiores o especializarse?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante tener interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada observan en su hijo/a la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a buscar información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada considero que está en mí la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que está en mí buscar información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante buscar información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la búsqueda de información sobre carreras, universidades, becas u oportunidades profesionales?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante buscar información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada observan en su hijo/a la exploración de opciones de futuro por iniciativa propia?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a explorar opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollada considero que está en mí la exploración de opciones de futuro por iniciativa propia?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que está en mí explorar opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Según su relación cercana, ¿qué tan desarrollada observa en el/la estudiante la exploración de opciones de futuro por iniciativa propia?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante explorar opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tan desarrollada está en el/la estudiante la exploración de opciones de futuro por iniciativa propia?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante explorar opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado observan en su hijo/a el compromiso con su proyecto de vida académico y profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan desarrollado observan en su hijo/a demostrar compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante el compromiso con su proyecto de vida académico y profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Según su relación cercana, ¿qué tan desarrollado observa en el/la estudiante demostrar compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante el compromiso con su proyecto de vida académico y profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su observación, ¿qué tan desarrollado está en el/la estudiante demostrar compromiso con su proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Ordenen las áreas académicas y profesionales según la afinidad que observan en su hijo/a:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = 'Ordene las áreas académicas y profesionales según la afinidad que observan en su hijo/a:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccionen las industrias donde observan mayor posibilidad de éxito profesional para su hijo/a:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = 'Seleccione las industrias donde observan mayor posibilidad de éxito profesional:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccionen las actividades que consideran que su hijo/a más disfruta o podría disfrutar:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = 'Seleccione las actividades que consideran que su hijo/a más disfruta o podría disfrutar:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccionen el tipo de trabajo que probablemente disfrutaría más su hijo/a:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = 'Seleccione el tipo de trabajo que probablemente disfrutaría su hijo/a más:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional para el/la estudiante:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional para el/la estudiante:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Seleccione las industrias donde observa mayor posibilidad de éxito profesional:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Seleccione el tipo de trabajo que probablemente disfrutaría más el/la estudiante:', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Seleccione el tipo de trabajo que probablemente disfrutaría el/la estudiante más:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿En qué área académica observa el mejor desempeño del/de la estudiante?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher' AND v."group" = 'teacher' AND v."textEs" = '¿En qué área académica observa su mejor desempeño?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿En qué ámbito han observado los mayores talentos de su hijo/a: académico, social, creativo, técnico, deportivo, artístico, comercial u otro?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'parent' AND v."group" = 'parent' AND v."textEs" = '¿Dónde han observado sus mayores talentos: académico, social, creativo, técnico, deportivo, artístico, comercial u otro?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué carrera o área profesional consideran que permitiría desarrollar mejor el potencial de su hijo/a y por qué?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'parent' AND v."group" = 'parent' AND v."textEs" = '¿Qué carrera o área profesional consideran que permitiría desarrollar mejor su potencial y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿En qué tipo de trabajo o industria imagina más exitoso/a al/a la estudiante?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend' AND v."textEs" = '¿En qué tipo de trabajo o industria lo/la imagina más exitoso/a?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué fortalezas consideran que diferencian a su hijo/a de otros jóvenes de su edad?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'parent' AND v."group" = 'parent' AND v."textEs" = '¿Qué fortalezas consideran que lo/la diferencian de otros jóvenes de su edad?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué carrera, área académica o familia profesional le recomendaría explorar al/a la estudiante y por qué?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 49 AND q."group" = 'teacher' AND v."group" = 'teacher' AND v."textEs" = '¿Qué carrera, área académica o familia profesional recomendaría explorar y por qué?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Cuál es su principal preocupación respecto al futuro profesional de su hijo/a?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent' AND v."group" = 'parent' AND v."textEs" = '¿Cuál es su principal preocupación respecto a su futuro profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué habilidad considera más importante fortalecer para mejorar el éxito universitario y profesional del/de la estudiante?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'teacher' AND v."group" = 'teacher' AND v."textEs" = '¿Qué habilidad considera más importante fortalecer para mejorar su éxito universitario y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Tecnología y Sistemas' THEN jsonb_set(e, '{labelEs}', to_jsonb('Tecnología y sistemas'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Tecnología y Sistemas'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Matemáticas y Estadística' THEN jsonb_set(e, '{labelEs}', to_jsonb('Matemáticas y estadística'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Matemáticas y Estadística'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Ciencias de la Salud' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencias de la salud'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Ciencias de la Salud'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Negocios y Administración' THEN jsonb_set(e, '{labelEs}', to_jsonb('Negocios y administración'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Negocios y Administración'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Marketing y Comunicación' THEN jsonb_set(e, '{labelEs}', to_jsonb('Marketing y comunicación'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Marketing y Comunicación'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Finanzas y Economía' THEN jsonb_set(e, '{labelEs}', to_jsonb('Finanzas y economía'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Finanzas y Economía'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Ciencias Sociales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencias sociales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Ciencias Sociales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Relaciones Internacionales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Relaciones internacionales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Relaciones Internacionales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Ciencias Ambientales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencias ambientales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Ciencias Ambientales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Logística y Operaciones' THEN jsonb_set(e, '{labelEs}', to_jsonb('Logística y operaciones'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Logística y Operaciones'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Producción Audiovisual' THEN jsonb_set(e, '{labelEs}', to_jsonb('Producción audiovisual'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Producción Audiovisual'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Investigación Científica' THEN jsonb_set(e, '{labelEs}', to_jsonb('Investigación científica'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Investigación Científica'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Banca y Finanzas' THEN jsonb_set(e, '{labelEs}', to_jsonb('Banca y finanzas'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Banca y Finanzas'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Consumo Masivo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Consumo masivo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Consumo Masivo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Organismos Internacionales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Organismos internacionales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Organismos Internacionales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Marketing y Publicidad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Marketing y publicidad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Marketing y Publicidad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Comercio Electrónico' THEN jsonb_set(e, '{labelEs}', to_jsonb('Comercio electrónico'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Comercio Electrónico'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Investigación y Desarrollo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Investigación y desarrollo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Investigación y Desarrollo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'matemáticas' THEN jsonb_set(e, '{labelEs}', to_jsonb('Matemáticas'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'matemáticas'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'ciencias' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencias'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'ciencias'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'comunicación' THEN jsonb_set(e, '{labelEs}', to_jsonb('Comunicación'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'comunicación'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'ciencias sociales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencias sociales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'ciencias sociales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'arte/diseño' THEN jsonb_set(e, '{labelEs}', to_jsonb('Arte/diseño'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'arte/diseño'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'tecnología' THEN jsonb_set(e, '{labelEs}', to_jsonb('Tecnología'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'tecnología'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'idiomas' THEN jsonb_set(e, '{labelEs}', to_jsonb('Idiomas'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'idiomas'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'liderazgo/proyectos' THEN jsonb_set(e, '{labelEs}', to_jsonb('Liderazgo/proyectos'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'liderazgo/proyectos'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otra' THEN jsonb_set(e, '{labelEs}', to_jsonb('Otra'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otra'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'tecnología' THEN jsonb_set(e, '{labelEs}', to_jsonb('Tecnología'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'tecnología'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'negocios' THEN jsonb_set(e, '{labelEs}', to_jsonb('Negocios'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'negocios'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'deporte' THEN jsonb_set(e, '{labelEs}', to_jsonb('Deporte'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'deporte'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'moda' THEN jsonb_set(e, '{labelEs}', to_jsonb('Moda'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'moda'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'música' THEN jsonb_set(e, '{labelEs}', to_jsonb('Música'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'música'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'arte' THEN jsonb_set(e, '{labelEs}', to_jsonb('Arte'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'arte'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'salud' THEN jsonb_set(e, '{labelEs}', to_jsonb('Salud'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'salud'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'psicología' THEN jsonb_set(e, '{labelEs}', to_jsonb('Psicología'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'psicología'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'política' THEN jsonb_set(e, '{labelEs}', to_jsonb('Política'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'política'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'viajes' THEN jsonb_set(e, '{labelEs}', to_jsonb('Viajes'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'viajes'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'videojuegos' THEN jsonb_set(e, '{labelEs}', to_jsonb('Videojuegos'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'videojuegos'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'redes sociales' THEN jsonb_set(e, '{labelEs}', to_jsonb('Redes sociales'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'redes sociales'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'emprendimiento' THEN jsonb_set(e, '{labelEs}', to_jsonb('Emprendimiento'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'emprendimiento'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'ciencia' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ciencia'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'ciencia'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro' THEN jsonb_set(e, '{labelEs}', to_jsonb('Otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'lógico-analítico' THEN jsonb_set(e, '{labelEs}', to_jsonb('Lógico-analítico'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'lógico-analítico'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'creativo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Creativo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'creativo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'práctico' THEN jsonb_set(e, '{labelEs}', to_jsonb('Práctico'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'práctico'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'social-comunicativo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Social-comunicativo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'social-comunicativo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'técnico' THEN jsonb_set(e, '{labelEs}', to_jsonb('Técnico'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'técnico'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'estratégico' THEN jsonb_set(e, '{labelEs}', to_jsonb('Estratégico'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'estratégico'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'reflexivo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Reflexivo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'reflexivo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'emprendedor' THEN jsonb_set(e, '{labelEs}', to_jsonb('Emprendedor'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'emprendedor'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'elegir carrera equivocada' THEN jsonb_set(e, '{labelEs}', to_jsonb('Elegir carrera equivocada'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'elegir carrera equivocada'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'no encontrar trabajo' THEN jsonb_set(e, '{labelEs}', to_jsonb('No encontrar trabajo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'no encontrar trabajo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'no cumplir expectativas familiares' THEN jsonb_set(e, '{labelEs}', to_jsonb('No cumplir expectativas familiares'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'no cumplir expectativas familiares'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'no saber qué me gusta' THEN jsonb_set(e, '{labelEs}', to_jsonb('No saber qué me gusta'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'no saber qué me gusta'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'costo de estudios' THEN jsonb_set(e, '{labelEs}', to_jsonb('Costo de estudios'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'costo de estudios'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'estudiar fuera del país' THEN jsonb_set(e, '{labelEs}', to_jsonb('Estudiar fuera del país'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'estudiar fuera del país'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'presión académica' THEN jsonb_set(e, '{labelEs}', to_jsonb('Presión académica'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'presión académica'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'falta de experiencia' THEN jsonb_set(e, '{labelEs}', to_jsonb('Falta de experiencia'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'falta de experiencia'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro' THEN jsonb_set(e, '{labelEs}', to_jsonb('Otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'tecnología' THEN jsonb_set(e, '{labelEs}', to_jsonb('Tecnología'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'tecnología'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'banca' THEN jsonb_set(e, '{labelEs}', to_jsonb('Banca'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'banca'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'marketing' THEN jsonb_set(e, '{labelEs}', to_jsonb('Marketing'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'marketing'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'entretenimiento' THEN jsonb_set(e, '{labelEs}', to_jsonb('Entretenimiento'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'entretenimiento'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'educación' THEN jsonb_set(e, '{labelEs}', to_jsonb('Educación'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'educación'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'salud' THEN jsonb_set(e, '{labelEs}', to_jsonb('Salud'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'salud'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'emprendimiento' THEN jsonb_set(e, '{labelEs}', to_jsonb('Emprendimiento'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'emprendimiento'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'deportes' THEN jsonb_set(e, '{labelEs}', to_jsonb('Deportes'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'deportes'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'consultoría' THEN jsonb_set(e, '{labelEs}', to_jsonb('Consultoría'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'consultoría'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'diseño' THEN jsonb_set(e, '{labelEs}', to_jsonb('Diseño'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'diseño'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'sector público' THEN jsonb_set(e, '{labelEs}', to_jsonb('Sector público'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'sector público'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'turismo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Turismo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'turismo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro' THEN jsonb_set(e, '{labelEs}', to_jsonb('Otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'falta de claridad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Falta de claridad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'falta de claridad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'baja motivación' THEN jsonb_set(e, '{labelEs}', to_jsonb('Baja motivación'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'baja motivación'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'presión externa' THEN jsonb_set(e, '{labelEs}', to_jsonb('Presión externa'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'presión externa'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'dificultad académica' THEN jsonb_set(e, '{labelEs}', to_jsonb('Dificultad académica'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'dificultad académica'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'elección poco realista' THEN jsonb_set(e, '{labelEs}', to_jsonb('Elección poco realista'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'elección poco realista'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'falta de disciplina' THEN jsonb_set(e, '{labelEs}', to_jsonb('Falta de disciplina'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'falta de disciplina'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'empleabilidad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Empleabilidad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'empleabilidad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'adaptación a la universidad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Adaptación a la universidad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'adaptación a la universidad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro' THEN jsonb_set(e, '{labelEs}', to_jsonb('Otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'ingresos' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ingresos'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'ingresos'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'estabilidad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Estabilidad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'estabilidad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'reconocimiento' THEN jsonb_set(e, '{labelEs}', to_jsonb('Reconocimiento'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'reconocimiento'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'ayudar a otros' THEN jsonb_set(e, '{labelEs}', to_jsonb('Ayudar a otros'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'ayudar a otros'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'innovación' THEN jsonb_set(e, '{labelEs}', to_jsonb('Innovación'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'innovación'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'libertad' THEN jsonb_set(e, '{labelEs}', to_jsonb('Libertad'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'libertad'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'prestigio' THEN jsonb_set(e, '{labelEs}', to_jsonb('Prestigio'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'prestigio'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'aprendizaje continuo' THEN jsonb_set(e, '{labelEs}', to_jsonb('Aprendizaje continuo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'aprendizaje continuo'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), "scaleAnchors" = (
      SELECT jsonb_agg(CASE WHEN e #>> '{}' = 'Nada seguro' THEN to_jsonb('Nada seguro/a'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q."scaleAnchors") WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND q."scaleAnchors" @> jsonb_build_array('Nada seguro'::text);
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), "scaleAnchors" = (
      SELECT jsonb_agg(CASE WHEN e #>> '{}' = 'Poco seguro' THEN to_jsonb('Poco seguro/a'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q."scaleAnchors") WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND q."scaleAnchors" @> jsonb_build_array('Poco seguro'::text);
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), "scaleAnchors" = (
      SELECT jsonb_agg(CASE WHEN e #>> '{}' = 'Moderadamente seguro' THEN to_jsonb('Moderadamente seguro/a'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q."scaleAnchors") WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND q."scaleAnchors" @> jsonb_build_array('Moderadamente seguro'::text);
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), "scaleAnchors" = (
      SELECT jsonb_agg(CASE WHEN e #>> '{}' = 'Bastante seguro' THEN to_jsonb('Bastante seguro/a'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q."scaleAnchors") WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND q."scaleAnchors" @> jsonb_build_array('Bastante seguro'::text);
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), "scaleAnchors" = (
      SELECT jsonb_agg(CASE WHEN e #>> '{}' = 'Totalmente seguro' THEN to_jsonb('Totalmente seguro/a'::text) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q."scaleAnchors") WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'self'
     AND q."scaleAnchors" @> jsonb_build_array('Totalmente seguro'::text);
  GET DIAGNOSTICS c = ROW_COUNT; n_anc := n_anc + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Intereses académicos', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Intereses Académicos';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Habilidades académicas percibidas', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Habilidades Académicas Percibidas';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Forma de aprender', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Forma de Aprender';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Motivadores personales', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Motivadores Personales';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Relación con las personas', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Relación con las Personas';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Estilo de trabajo', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Estilo de Trabajo';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Potencial profesional percibido', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Potencial Profesional Percibido';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_dimensions d SET "nameEs" = 'Madurez para la vida profesional', "updatedAt" = now()
    FROM vocational_instruments i
   WHERE i.id = d."instrumentId" AND i.version = 'v1' AND d."nameEs" = 'Madurez para la Vida Profesional';
  GET DIAGNOSTICS c = ROW_COUNT; n_dim := n_dim + c;
  UPDATE vocational_instruments SET name = 'Evaluación 360 de orientación vocacional', "updatedAt" = now()
   WHERE version = 'v1' AND name = 'Evaluación 360 de Orientación Vocacional';
  GET DIAGNOSTICS c = ROW_COUNT; n_ins := n_ins + c;
  RAISE NOTICE '360 grammar round 2: % of 39 question texts, % of 89 option labels, % of 5 scale anchors, % of 8 dimension names, % of 1 instrument name updated (lower = already applied or edited in prod)', n_var, n_opt, n_anc, n_dim, n_ins;
END
$$;
