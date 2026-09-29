-- =====================================================================================
-- 360 (Vocational instrument v1) — Spanish grammar fixes, 31 question texts + 11 option labels.
--
-- GENERATED from api/scripts/data/vocational-360-instrument.json (legacy repo, fix/grammar-en-es)
-- by diffing it against origin/main. The questions students see are read from the DATABASE,
-- which the seed script loaded; editing the JSON alone changes nothing in production.
--
-- SAFE BY CONSTRUCTION
--  * Every UPDATE matches the EXACT old text (and instrument version + question number + group).
--    Re-running is a no-op; a row someone already edited by hand is left alone.
--  * Text only: no value, scoring rule, weight, id or key changes. Options are edited label-by-
--    label inside the jsonb, never replaced wholesale.
--  * Runs under --single-transaction via formmaps-sql-apply; the summary below prints how many
--    rows each part touched, so a 0 is visible rather than silent.
-- =====================================================================================
DO $$
DECLARE n_var int := 0; n_opt int := 0; c int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vocational_instruments WHERE version = 'v1') THEN
    RAISE EXCEPTION 'instrument version v1 not found — refusing';
  END IF;
  UPDATE vocational_question_variants v SET "textEs" = '¿Cómo evalúo mi facilidad para expresarme con claridad de forma oral y escrita?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 8 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Cómo evalúo mi facilidad para expresarse con claridad de forma oral y escrita?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Con qué frecuencia tiendo a buscar información adicional cuando un tema me interesa?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 12 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Con qué frecuencia tiendo a buscar información adicional cuando un tema le interesa?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan característico es en mí relacionarme con nuevas personas y construir vínculos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 21 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan característico es en mí relacionarse con nuevas personas y construir vínculos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan característico es en mí escuchar activamente y comprender distintos puntos de vista?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 23 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan característico es para mi, escuchar activamente y comprender distintos puntos de vista?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan característico es en mí trabajar en equipo y colaborar con otros?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 24 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan característico es para mi, trabajar en equipo y colaborar con otros?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan de acuerdo estoy con que suelo adaptarme fácilmente al cambio, la incertidumbre o los nuevos retos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 27 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo adaptarse fácilmente al cambio, la incertidumbre o los nuevos retos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan de acuerdo estoy con que suelo ser cuidadoso/a con los detalles y la calidad del trabajo?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan de acuerdo estoy con que suelo ser cuidadoso con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele ser cuidadoso/a con los detalles y la calidad del trabajo?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'parent' AND v."textEs" = '¿Qué tan de acuerdo están con que su hijo/a suele ser cuidadoso con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso/a con los detalles y la calidad del trabajo?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'En tareas, proyectos o clases, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso/a con los detalles y la calidad del trabajo?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 28 AND q."group" IS NULL AND v."group" = 'sibling_friend' AND v."textEs" = 'En actividades cotidianas, compromisos o proyectos, ¿qué tan de acuerdo está con que el/la estudiante suele ser cuidadoso con los detalles y la calidad del trabajo?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué potencial considero que tengo para destacarme en roles analíticos, técnicos o de datos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué potencial considero que tengo para destacarse en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en roles analíticos, técnicos o de datos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 31 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa para destacarse en roles analíticos, técnicos o de datos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué potencial considero que tengo para destacarme liderando equipos, proyectos o iniciativas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué potencial considero que tengo para destacarse liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse liderando equipos, proyectos o iniciativas?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 32 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa para destacarse liderando equipos, proyectos o iniciativas?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué potencial considero que tengo para destacarme en funciones comerciales, ventas, negociación o relacionamiento con clientes?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué potencial considero que tengo para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 33 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa para destacarse en funciones comerciales, ventas, negociación o relacionamiento con clientes?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué potencial considero que tengo para destacarme en actividades creativas, diseño, comunicación o generación de contenido?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué potencial considero que tengo para destacarse en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en actividades creativas, diseño, comunicación o generación de contenido?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 34 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa para destacarse en actividades creativas, diseño, comunicación o generación de contenido?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué potencial considero que tengo para destacarme en investigación, generación de conocimiento o solución de problemas complejos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué potencial considero que tengo para destacarse en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = 'Desde su criterio académico, ¿qué potencial observa en el/la estudiante para destacarse en investigación, generación de conocimiento o solución de problemas complejos?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 35 AND q."group" IS NULL AND v."group" = 'teacher' AND v."textEs" = 'Desde su criterio académico, ¿qué potencial observa para destacarse en investigación, generación de conocimiento o solución de problemas complejos?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está en mí comprender la importancia de construir una carrera profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 36 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que tengo comprender la importancia de construir una carrera profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está en mí tener interés genuino en continuar estudios superiores o especializarme?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 37 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que tengo tener interés genuino en continuar estudios superiores o especializarse?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está en mí buscar información sobre carreras, universidades, becas u oportunidades profesionales?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 38 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que tengo buscar información sobre carreras, universidades, becas u oportunidades profesionales?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está en mí explorar opciones de futuro por iniciativa propia?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 39 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que tengo explorar opciones de futuro por iniciativa propia?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tan desarrollado considero que está mi compromiso con mi proyecto de vida académico y profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 40 AND q."group" IS NULL AND v."group" = 'self' AND v."textEs" = '¿Qué tan desarrollado considero que tengo mi compromiso con mi proyecto de vida académico y profesional?';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿En qué área académica observa su mejor desempeño?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher' AND v."group" = 'teacher' AND v."textEs" = '¿En qué área académica observa su mejor desempeño? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué temas le apasionan al/a la estudiante o sobre cuáles conversa con más entusiasmo?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend' AND v."textEs" = '¿Qué temas le apasionan al/a la estudiante o sobre cuáles conversa con más entusiasmo? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué tipo de pensamiento predomina en el/la estudiante?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher' AND v."group" = 'teacher' AND v."textEs" = '¿Qué tipo de pensamiento predomina en el/la estudiante? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Qué aspectos me preocupan más sobre mi futuro profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self' AND v."group" = 'self' AND v."textEs" = '¿Qué aspectos me preocupan más sobre mi futuro profesional? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿En qué tipo de trabajo o industria lo/la imagina más exitoso/a?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend' AND v."group" = 'sibling_friend' AND v."textEs" = '¿En qué tipo de trabajo o industria lo/la imagina más exitoso/a? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_question_variants v SET "textEs" = '¿Cuál es su principal preocupación respecto a su futuro profesional?', "updatedAt" = now()
    FROM vocational_questions q JOIN vocational_instruments i ON i.id = q."instrumentId"
   WHERE v."questionId" = q.id AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent' AND v."group" = 'parent' AND v."textEs" = '¿Cuál es su principal preocupación respecto a su futuro profesional? Opciones:';
  GET DIAGNOSTICS c = ROW_COUNT; n_var := n_var + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Investigación Científica.' THEN jsonb_set(e, '{labelEs}', to_jsonb('Investigación Científica'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 41 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Investigación Científica.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Emprendimiento.' THEN jsonb_set(e, '{labelEs}', to_jsonb('Emprendimiento'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 42 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Emprendimiento.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Innovar.' THEN jsonb_set(e, '{labelEs}', to_jsonb('Innovar'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 43 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Innovar.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'Operativo.' THEN jsonb_set(e, '{labelEs}', to_jsonb('Operativo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 44 AND q."group" IS NULL
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'Operativo.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otra.' THEN jsonb_set(e, '{labelEs}', to_jsonb('otra'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 46 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otra.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro.' THEN jsonb_set(e, '{labelEs}', to_jsonb('otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'emprendedor.' THEN jsonb_set(e, '{labelEs}', to_jsonb('emprendedor'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 47 AND q."group" = 'teacher'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'emprendedor.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro.' THEN jsonb_set(e, '{labelEs}', to_jsonb('otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro.' THEN jsonb_set(e, '{labelEs}', to_jsonb('otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 48 AND q."group" = 'sibling_friend'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'otro.' THEN jsonb_set(e, '{labelEs}', to_jsonb('otro'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'parent'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'otro.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  UPDATE vocational_questions q SET "updatedAt" = now(), options = (
      SELECT jsonb_agg(CASE WHEN e->>'labelEs' = 'aprendizaje continuo.' THEN jsonb_set(e, '{labelEs}', to_jsonb('aprendizaje continuo'::text)) ELSE e END ORDER BY ord)
        FROM jsonb_array_elements(q.options) WITH ORDINALITY t(e, ord))
    FROM vocational_instruments i
   WHERE i.id = q."instrumentId" AND i.version = 'v1' AND q.number = 50 AND q."group" = 'self'
     AND q.options @> jsonb_build_array(jsonb_build_object('labelEs', 'aprendizaje continuo.'::text));
  GET DIAGNOSTICS c = ROW_COUNT; n_opt := n_opt + c;
  RAISE NOTICE '360 grammar: % of 31 question texts and % of 11 option labels updated (lower = already applied or edited in prod)', n_var, n_opt;
END
$$;
