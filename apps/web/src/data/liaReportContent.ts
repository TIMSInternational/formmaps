import type { LIASubtest, LIAPerformanceLevel } from '@/services/liaService';

// ============================================
// LIA/MIL REPORT CONTENT DATA
// Based on official TIMS MIL documentation
// ============================================

export interface SubtestContent {
  name: { es: string; en: string };
  description: { es: string; en: string };
}

export interface PerformanceLevelContent {
  interpretations: { es: string[]; en: string[] };
  strategies: { es: string[]; en: string[] };
}

// Subtest descriptions
export const SUBTEST_DESCRIPTIONS: Record<LIASubtest, SubtestContent> = {
  pattern_recognition: {
    name: { es: 'Detección de características', en: 'Pattern Recognition' },
    description: {
      es: 'Esta prueba mide que tan rápido y exacto un individuo puede revisar errores y trabajar con exactitud y luego describir esos datos o hacer una observación sobre los mismos. Adicionalmente, mide la habilidad general de instrucción y la Velocidad General.',
      en: 'This test measures how quickly and accurately an individual can review errors and work with precision and then describe that data or make an observation about it. Additionally, it measures general instruction ability and General Speed.',
    },
  },
  verbal_reasoning: {
    name: { es: 'Razonamiento', en: 'Verbal Reasoning' },
    description: {
      es: 'Esta prueba evalúa la habilidad de un individuo para retener información en la memoria a corto plazo y resolver problemas luego de recibir instrucciones orales o escritas. Evalúa además la capacidad de hacer inferencias, a la razón de la información proporcionada y elaborar correctas conclusiones.',
      en: 'This test evaluates an individual\'s ability to retain information in short-term memory and solve problems after receiving oral or written instructions. It also evaluates the ability to make inferences from the information provided and draw correct conclusions.',
    },
  },
  numerical_speed: {
    name: { es: 'Velocidad y exactitud numérica', en: 'Numerical Speed & Accuracy' },
    description: {
      es: 'Esta prueba es relevante en roles en donde sea necesaria la aptitud numérica, en especial aquellos que claramente requieran de capacidad para calcular, tales como ventas técnicas, ventas al detalle y la mayoría de roles gerenciales. Esta habilidad es importante en trabajos en donde se requiere atención y concentración constantes en las tareas del trabajo.',
      en: 'This test is relevant in roles where numerical aptitude is necessary, especially those that clearly require calculation ability, such as technical sales, retail sales, and most management roles. This skill is important in jobs where constant attention and concentration on work tasks is required.',
    },
  },
  working_memory: {
    name: { es: 'Memoria de trabajo', en: 'Working Memory' },
    description: {
      es: 'Mide la habilidad para resolver problemas y hacer deducciones en aquellos trabajos en los que existe una carga de trabajo mental alta y que requieren de periodos de larga concentración. Esta prueba discrimina a los aprendices lentos de los rápidos, en los contextos de capacitación que requieren un lapso substancial de atención y de concentración durante períodos prolongados.',
      en: 'Measures the ability to solve problems and make deductions in jobs where there is a high mental workload and that require long periods of concentration. This test discriminates slow learners from fast ones, in training contexts that require a substantial span of attention and concentration over extended periods.',
    },
  },
  visual_rotation: {
    name: { es: 'Orientación', en: 'Visual Rotation' },
    description: {
      es: 'Examina las habilidades individuales para utilizar la orientación y visualización mental para enfrentar problemas mecánicos y técnicos. Una nota alta en esta área tiene vital importancia en donde las capacidades de habilidades mentales son requeridas, i.e. resoluciones de problemas prácticos o lógicos que implican la interpretación de un plan o un diagrama. Es importante para roles técnicos o en el área de ingeniería, incluyendo aprendices y/o trainees.',
      en: 'Examines individual abilities to use mental orientation and visualization to face mechanical and technical problems. A high score in this area is vitally important where mental skill capabilities are required, i.e. solving practical or logical problems involving the interpretation of a plan or diagram. It is important for technical roles or in engineering, including apprentices and/or trainees.',
    },
  },
};

// Performance level content per subtest
export const SUBTEST_LEVEL_CONTENT: Record<LIASubtest, Record<LIAPerformanceLevel, PerformanceLevelContent>> = {
  // ============================================
  // PATTERN RECOGNITION (Detección de características)
  // ============================================
  pattern_recognition: {
    insufficient: {
      interpretations: {
        es: [
          'Presenta grandes dificultades en cuanto a la exactitud de sus labores.',
          'Se le dificulta identificar errores en diagramas, textos e información variada.',
          'No presta atención a los detalles relevantes.',
          'No es recomendable asignarle labores que requieran precisión y exactitud sin supervisión constante.',
          'Se distrae con facilidad.',
          'La velocidad de ejecución es muy baja.',
        ],
        en: [
          'Has great difficulties regarding the accuracy of their work.',
          'Has difficulty identifying errors in diagrams, texts, and various information.',
          'Does not pay attention to relevant details.',
          'It is not recommended to assign tasks requiring precision and accuracy without constant supervision.',
          'Gets easily distracted.',
          'Execution speed is very low.',
        ],
      },
      strategies: {
        es: [
          'Utilización obligatoria de listas de verificación.',
          'Asegurarse de que toda la información crítica sea verificada por otra persona.',
          'Establecer límites de tiempo muy amplios para la ejecución de labores.',
          'Desarrollar habilidades básicas de atención y concentración.',
          'Capacitación intensiva en detección de errores.',
        ],
        en: [
          'Mandatory use of checklists.',
          'Ensure all critical information is verified by another person.',
          'Set very broad time limits for task execution.',
          'Develop basic attention and concentration skills.',
          'Intensive training in error detection.',
        ],
      },
    },
    low: {
      interpretations: {
        es: [
          'Presenta dificultades frecuentes en cuanto a la exactitud de sus labores.',
          'Puede identificar algunos errores pero se le escapan muchos.',
          'La atención a los detalles es inconsistente.',
          'Requiere supervisión frecuente para labores de precisión.',
          'Tiende a distraerse.',
          'La velocidad de ejecución está por debajo del promedio.',
        ],
        en: [
          'Has frequent difficulties regarding work accuracy.',
          'Can identify some errors but misses many.',
          'Attention to detail is inconsistent.',
          'Requires frequent supervision for precision tasks.',
          'Tends to get distracted.',
          'Execution speed is below average.',
        ],
      },
      strategies: {
        es: [
          'Utilización de listas de verificación.',
          'Verificación de información crítica por otra persona.',
          'Establecer límites de tiempo razonables para la ejecución de labores.',
          'Desarrollar habilidades de priorización.',
          'Capacitación en técnicas de concentración.',
        ],
        en: [
          'Use of checklists.',
          'Critical information verification by another person.',
          'Set reasonable time limits for task execution.',
          'Develop prioritization skills.',
          'Training in concentration techniques.',
        ],
      },
    },
    acceptable: {
      interpretations: {
        es: [
          'Esta persona en ocasiones presenta ciertas dificultades en cuanto a la exactitud de sus labores.',
          'Es capaz de identificar errores en diagramas, textos e información variada sin embargo en ocasiones esto le puede tomar más tiempo de lo esperado.',
          'Presta igual cantidad de atención a detalles relevantes como irrelevantes.',
          'Si su trabajo requiere precisión y exactitud puede lograrlo, sin embargo se recomienda supervisarlo.',
          'Parece distraído(a).',
          'Es preciso y exacto, siempre y cuando cuente con tiempos razonables para ejecutar sus labores.',
        ],
        en: [
          'This person sometimes has certain difficulties regarding the accuracy of their work.',
          'Is able to identify errors in diagrams, texts, and various information, however this can sometimes take longer than expected.',
          'Pays equal attention to relevant and irrelevant details.',
          'If their work requires precision and accuracy they can achieve it, however supervision is recommended.',
          'Appears distracted.',
          'Is precise and accurate, as long as they have reasonable times to execute their tasks.',
        ],
      },
      strategies: {
        es: [
          'Utilización de listas de verificación.',
          'Asegurarse de que la información crítica sea previamente verificada por otra persona.',
          'Establecer límites de tiempo razonables para la ejecución de labores y establecer prioridades.',
          'Desarrollar habilidades que le permitan establecer prioridades y omitir detalles irrelevantes en su área de trabajo.',
        ],
        en: [
          'Use of checklists.',
          'Ensure critical information is previously verified by another person.',
          'Set reasonable time limits for task execution and establish priorities.',
          'Develop skills that allow establishing priorities and omitting irrelevant details in their work area.',
        ],
      },
    },
    high: {
      interpretations: {
        es: [
          'Es capaz de identificar errores en diagramas, textos e información variada de manera rápida.',
          'Presta atención principalmente a los detalles relevantes.',
          'Sus labores de precisión y exactitud son confiables.',
          'Mantiene buena concentración.',
          'Es preciso y exacto con buenos tiempos de ejecución.',
        ],
        en: [
          'Is able to identify errors in diagrams, texts, and various information quickly.',
          'Pays attention mainly to relevant details.',
          'Their precision and accuracy work is reliable.',
          'Maintains good concentration.',
          'Is precise and accurate with good execution times.',
        ],
      },
      strategies: {
        es: [
          'Enfrentarle a problemas que le exijan utilizar sus habilidades de detección con el fin de perfeccionarlas.',
          'Supervisar labores de terceros que impliquen esta habilidad.',
          'Entrenamientos que le permitan continuar afianzando sus destrezas.',
        ],
        en: [
          'Present them with problems that require using their detection skills to perfect them.',
          'Supervise third-party work involving this skill.',
          'Training to continue strengthening their skills.',
        ],
      },
    },
    outstanding: {
      interpretations: {
        es: [
          'Identifica errores en diagramas, textos e información variada con gran rapidez y exactitud.',
          'Presta atención selectiva a los detalles relevantes, omitiendo los irrelevantes.',
          'Sus labores de precisión y exactitud son excepcionales.',
          'Mantiene excelente concentración por períodos prolongados.',
          'Es altamente preciso y exacto con tiempos de ejecución sobresalientes.',
        ],
        en: [
          'Identifies errors in diagrams, texts, and various information with great speed and accuracy.',
          'Pays selective attention to relevant details, omitting irrelevant ones.',
          'Their precision and accuracy work is exceptional.',
          'Maintains excellent concentration for extended periods.',
          'Is highly precise and accurate with outstanding execution times.',
        ],
      },
      strategies: {
        es: [
          'Enfrentarle a problemas complejos que le exijan utilizar sus habilidades de detección al máximo.',
          'Liderar equipos que requieran esta habilidad.',
          'Supervisar y entrenar a compañeros en esta área.',
          'Aportar su experiencia y conocimiento para apoyar a compañeros que no posean esta habilidad desarrollada.',
        ],
        en: [
          'Present them with complex problems that require using their detection skills to the maximum.',
          'Lead teams that require this skill.',
          'Supervise and train colleagues in this area.',
          'Contribute their experience and knowledge to support colleagues who do not have this skill developed.',
        ],
      },
    },
  },

  // ============================================
  // VERBAL REASONING (Razonamiento)
  // ============================================
  verbal_reasoning: {
    insufficient: {
      interpretations: {
        es: [
          'Se le dificulta retener información en la memoria a corto plazo.',
          'Tiene problemas para resolver problemas incluso con instrucciones claras.',
          'No logra hacer inferencias de la información proporcionada.',
          'Sus conclusiones suelen ser incorrectas o incompletas.',
          'El razonamiento lógico es un área de gran debilidad.',
        ],
        en: [
          'Has difficulty retaining information in short-term memory.',
          'Has problems solving problems even with clear instructions.',
          'Cannot make inferences from the information provided.',
          'Their conclusions are usually incorrect or incomplete.',
          'Logical reasoning is an area of great weakness.',
        ],
      },
      strategies: {
        es: [
          'Proporcionar instrucciones muy detalladas y por escrito.',
          'Verificar comprensión antes de iniciar tareas.',
          'Capacitación intensiva en razonamiento lógico.',
          'Ejercicios de memoria a corto plazo.',
          'Supervisión constante en tareas que requieran inferencias.',
        ],
        en: [
          'Provide very detailed written instructions.',
          'Verify understanding before starting tasks.',
          'Intensive training in logical reasoning.',
          'Short-term memory exercises.',
          'Constant supervision in tasks requiring inferences.',
        ],
      },
    },
    low: {
      interpretations: {
        es: [
          'Presenta dificultades para retener información en la memoria a corto plazo.',
          'La resolución de problemas le toma más tiempo del esperado.',
          'Puede hacer algunas inferencias pero con limitaciones.',
          'Sus conclusiones requieren verificación frecuente.',
          'El razonamiento lógico es un área de debilidad.',
        ],
        en: [
          'Has difficulties retaining information in short-term memory.',
          'Problem solving takes longer than expected.',
          'Can make some inferences but with limitations.',
          'Their conclusions require frequent verification.',
          'Logical reasoning is an area of weakness.',
        ],
      },
      strategies: {
        es: [
          'Proporcionar instrucciones detalladas y por escrito.',
          'Verificar comprensión de tareas complejas.',
          'Capacitación en razonamiento lógico.',
          'Ejercicios de memoria y concentración.',
          'Supervisión en tareas que requieran inferencias.',
        ],
        en: [
          'Provide detailed written instructions.',
          'Verify understanding of complex tasks.',
          'Training in logical reasoning.',
          'Memory and concentration exercises.',
          'Supervision in tasks requiring inferences.',
        ],
      },
    },
    acceptable: {
      interpretations: {
        es: [
          'Puede retener información en la memoria a corto plazo de manera adecuada.',
          'Resuelve problemas satisfactoriamente cuando cuenta con instrucciones claras.',
          'Es capaz de hacer inferencias básicas de la información proporcionada.',
          'Sus conclusiones son generalmente correctas.',
          'El razonamiento lógico está dentro del rango normal.',
        ],
        en: [
          'Can retain information in short-term memory adequately.',
          'Solves problems satisfactorily when given clear instructions.',
          'Is capable of making basic inferences from the information provided.',
          'Their conclusions are generally correct.',
          'Logical reasoning is within normal range.',
        ],
      },
      strategies: {
        es: [
          'Proporcionar oportunidades para desarrollar habilidades de razonamiento.',
          'Asignar tareas que requieran análisis moderado.',
          'Capacitación continua en resolución de problemas.',
          'Fomentar la práctica de inferencias complejas.',
        ],
        en: [
          'Provide opportunities to develop reasoning skills.',
          'Assign tasks requiring moderate analysis.',
          'Continuous training in problem solving.',
          'Encourage practice of complex inferences.',
        ],
      },
    },
    high: {
      interpretations: {
        es: [
          'Retiene información en la memoria a corto plazo con facilidad.',
          'Se le facilita la resolución de problemas con instrucciones orales o escritas.',
          'Es rápido en el razonamiento de la información proporcionada.',
          'Hace inferencias acertadas y elabora conclusiones correctas.',
        ],
        en: [
          'Retains information in short-term memory easily.',
          'Problem solving with oral or written instructions comes easily.',
          'Is quick in reasoning from the information provided.',
          'Makes accurate inferences and draws correct conclusions.',
        ],
      },
      strategies: {
        es: [
          'Enfrentarle a problemas que le exijan utilizar sus habilidades de razonamiento.',
          'Supervisar labores de terceros que impliquen esta habilidad.',
          'Entrenamientos que le permitan continuar afianzando sus destrezas.',
          'Aportar su experiencia para apoyar a compañeros.',
        ],
        en: [
          'Present them with problems that require using their reasoning skills.',
          'Supervise third-party work involving this skill.',
          'Training to continue strengthening their skills.',
          'Contribute their experience to support colleagues.',
        ],
      },
    },
    outstanding: {
      interpretations: {
        es: [
          'Mantiene fácilmente información en la memoria a corto plazo.',
          'Se le facilita la resolución de problemas principalmente si estos vienen acompañados de instrucciones orales o escritas.',
          'Es rápido en el razonamiento de la información proporcionada.',
          'Hace inferencias a raíz de la información proporcionada y elabora conclusiones acertadas.',
        ],
        en: [
          'Easily maintains information in short-term memory.',
          'Problem solving is easy, especially when accompanied by oral or written instructions.',
          'Is quick in reasoning from the information provided.',
          'Makes inferences from the information provided and draws accurate conclusions.',
        ],
      },
      strategies: {
        es: [
          'Enfrentarle a problemas y/o situaciones que le exijan utilizar sus habilidades de razonamiento con el fin de perfeccionarla.',
          'Supervisar labores de terceros que impliquen esta habilidad.',
          'Entrenamientos fast tracks que le permitan continuar afianzando sus destrezas.',
          'Aportar su experiencia y conocimiento en esta área para apoyar y/o brindar ayuda a compañeros que no posean esta habilidad desarrollada.',
        ],
        en: [
          'Present them with problems and/or situations that require using their reasoning skills to perfect them.',
          'Supervise third-party work involving this skill.',
          'Fast track training to continue strengthening their skills.',
          'Contribute their experience and knowledge in this area to support and/or help colleagues who do not have this skill developed.',
        ],
      },
    },
  },

  // ============================================
  // NUMERICAL SPEED (Velocidad y exactitud numérica)
  // ============================================
  numerical_speed: {
    insufficient: {
      interpretations: {
        es: [
          'Se siente muy inseguro cuando se trata de conceptos cuantitativos.',
          'Evita labores que requieran manipulación numérica.',
          'No es anuente a realizar labores que impliquen cifras.',
          'No es capaz de trabajar en entornos que requieran cálculo.',
          'La atención y concentración en aplicaciones numéricas es muy deficiente.',
        ],
        en: [
          'Feels very insecure when dealing with quantitative concepts.',
          'Avoids tasks requiring numerical manipulation.',
          'Is not willing to perform tasks involving figures.',
          'Is not capable of working in environments requiring calculation.',
          'Attention and concentration in numerical applications is very poor.',
        ],
      },
      strategies: {
        es: [
          'Evitar asignar labores que requieran habilidades numéricas.',
          'Si es necesario, proporcionar capacitación básica en matemáticas.',
          'Utilizar herramientas de apoyo como calculadoras y hojas de cálculo.',
          'Verificación de todos los cálculos por otra persona.',
        ],
        en: [
          'Avoid assigning tasks requiring numerical skills.',
          'If necessary, provide basic math training.',
          'Use support tools like calculators and spreadsheets.',
          'Verification of all calculations by another person.',
        ],
      },
    },
    low: {
      interpretations: {
        es: [
          'Se siente inseguro cuando se trata de conceptos cuantitativos.',
          'Las labores que requieren manipulación numérica le toman mucho tiempo.',
          'Puede realizar labores con cifras pero con dificultad.',
          'En entornos que requieren cálculo necesita apoyo adicional.',
          'La atención en aplicaciones numéricas es limitada.',
        ],
        en: [
          'Feels insecure when dealing with quantitative concepts.',
          'Tasks requiring numerical manipulation take a long time.',
          'Can perform tasks with figures but with difficulty.',
          'In environments requiring calculation needs additional support.',
          'Attention in numerical applications is limited.',
        ],
      },
      strategies: {
        es: [
          'Limitar labores que requieran habilidades numéricas complejas.',
          'Proporcionar capacitación en matemáticas básicas.',
          'Utilizar herramientas de apoyo.',
          'Supervisar cálculos importantes.',
        ],
        en: [
          'Limit tasks requiring complex numerical skills.',
          'Provide basic math training.',
          'Use support tools.',
          'Supervise important calculations.',
        ],
      },
    },
    acceptable: {
      interpretations: {
        es: [
          'Se presenta medianamente confiado cuando se trata de conceptos cuantitativos.',
          'Puede desempeñar labores que requieran manipulación numérica de manera satisfactoria.',
          'Es anuente a realizar labores que impliquen cifras.',
          'Puede trabajar en entornos que requieren cálculo con supervisión ocasional.',
          'La atención en aplicaciones numéricas es adecuada.',
        ],
        en: [
          'Is moderately confident when dealing with quantitative concepts.',
          'Can perform tasks requiring numerical manipulation satisfactorily.',
          'Is willing to perform tasks involving figures.',
          'Can work in environments requiring calculation with occasional supervision.',
          'Attention in numerical applications is adequate.',
        ],
      },
      strategies: {
        es: [
          'Proporcionar oportunidades para desarrollar habilidades numéricas.',
          'Asignar tareas numéricas de complejidad moderada.',
          'Capacitación continua en cálculo y análisis numérico.',
          'Verificación periódica de cálculos importantes.',
        ],
        en: [
          'Provide opportunities to develop numerical skills.',
          'Assign numerical tasks of moderate complexity.',
          'Continuous training in calculation and numerical analysis.',
          'Periodic verification of important calculations.',
        ],
      },
    },
    high: {
      interpretations: {
        es: [
          'Normalmente se presenta confiado cuando se trata de conceptos cuantitativos.',
          'Cuando debe de desempeñar labores que requieran manipulación numérica, lo realiza de manera satisfactoria y con buenos tiempos de ejecución.',
          'Es anuente a realizar labores que impliquen cifras.',
          'Es capaz de trabajar en entornos en los que se requiere el cálculo y donde la atención y la concentración son necesarias en relación con aplicaciones numéricas.',
        ],
        en: [
          'Is normally confident when dealing with quantitative concepts.',
          'When performing tasks requiring numerical manipulation, does so satisfactorily and with good execution times.',
          'Is willing to perform tasks involving figures.',
          'Is capable of working in environments where calculation is required and where attention and concentration are necessary in relation to numerical applications.',
        ],
      },
      strategies: {
        es: [
          'Enfrentarle a problemas y/o situaciones que le exijan utilizar sus habilidades de velocidad y exactitud numérica con el fin de potenciarlas.',
          'Brindar entrenamientos que le permitan afianzar sus habilidades.',
        ],
        en: [
          'Present them with problems and/or situations that require using their numerical speed and accuracy skills to enhance them.',
          'Provide training to strengthen their skills.',
        ],
      },
    },
    outstanding: {
      interpretations: {
        es: [
          'Demuestra gran confianza y habilidad con conceptos cuantitativos.',
          'Ejecuta labores numéricas con alta precisión y velocidad excepcional.',
          'Disfruta y busca tareas que impliquen cifras.',
          'Sobresale en entornos que requieren cálculo intensivo.',
          'Mantiene excelente atención y concentración en aplicaciones numéricas.',
        ],
        en: [
          'Demonstrates great confidence and skill with quantitative concepts.',
          'Executes numerical tasks with high precision and exceptional speed.',
          'Enjoys and seeks tasks involving figures.',
          'Excels in environments requiring intensive calculation.',
          'Maintains excellent attention and concentration in numerical applications.',
        ],
      },
      strategies: {
        es: [
          'Asignar proyectos complejos que requieran análisis numérico avanzado.',
          'Liderar equipos en áreas que requieran habilidades numéricas.',
          'Capacitar a compañeros en técnicas numéricas.',
          'Desarrollar metodologías de cálculo para el equipo.',
        ],
        en: [
          'Assign complex projects requiring advanced numerical analysis.',
          'Lead teams in areas requiring numerical skills.',
          'Train colleagues in numerical techniques.',
          'Develop calculation methodologies for the team.',
        ],
      },
    },
  },

  // ============================================
  // WORKING MEMORY (Memoria de trabajo)
  // ============================================
  working_memory: {
    insufficient: {
      interpretations: {
        es: [
          'Se le dificulta retener información durante un tiempo prolongado.',
          'Es pausado cuando se trata de almacenar simultáneamente gran cantidad de datos en su mente.',
          'Se le complica mantener y manipular la información de manera temporal.',
          'No tendrá tanto éxito en la conclusión de labores que impliquen grandes cargas de trabajo mental.',
          'El lograr concentrarse, retener, procesar e interpretar información, requiere para él un gran esfuerzo.',
          'Se le dificulta reconocer y seleccionar las metas y procedimientos adecuados para la resolución de un problema.',
          'Presenta dificultad para establecer planes de consecución de logros.',
          'Existe una falta de análisis sobre las actividades necesarias para la consecución de un objetivo y dificultades para la ejecución del mismo, no logrando la monitorización ni la posible modificación de sus labores según las metas planificadas.',
        ],
        en: [
          'Has difficulty retaining information for an extended time.',
          'Is slow when it comes to simultaneously storing large amounts of data in their mind.',
          'Has difficulty maintaining and manipulating information temporarily.',
          'Will not be as successful in completing tasks involving high mental workloads.',
          'Concentrating, retaining, processing, and interpreting information requires great effort.',
          'Has difficulty recognizing and selecting appropriate goals and procedures for problem solving.',
          'Has difficulty establishing achievement plans.',
          'There is a lack of analysis about the activities necessary to achieve an objective and difficulties in execution, failing to monitor or modify their work according to planned goals.',
        ],
      },
      strategies: {
        es: [
          'Someterse a diferentes tipos de ejercicios tales como memorizar 20 palabras en dos minutos, memorizar números solos, recordar los nombres de las personas, su profesión y número telefónico, entre otras cosas.',
          'Pruebas de concentración y mantenimiento de la habilidad de ejecución. Ejemplo: Brindarle al individuo una serie de instrucciones para que elabore un plan de acción, que lo sistematice paso a paso y con el mayor detalle posible, luego debe de recrear dicho plan de acción y sus respectivos pasos de manera oral, desde el inicio hasta el final. De esa manera se mide la capacidad del evaluado para poder hacer labores meticulosas durante lapsos de tiempo y con precisión y exactitud.',
        ],
        en: [
          'Undergo different types of exercises such as memorizing 20 words in two minutes, memorizing numbers alone, remembering people\'s names, their profession and phone number, among other things.',
          'Concentration tests and maintenance of execution ability. Example: Give the individual a series of instructions to develop an action plan, systematize it step by step and in as much detail as possible, then recreate said action plan and its respective steps orally, from start to finish. This way, the evaluated person\'s capacity to perform meticulous tasks over periods of time and with precision and accuracy is measured.',
        ],
      },
    },
    low: {
      interpretations: {
        es: [
          'Presenta dificultades para retener información durante períodos moderados.',
          'Le toma tiempo almacenar datos múltiples en su mente.',
          'La manipulación temporal de información es un área de debilidad.',
          'Labores con alta carga mental representan un desafío significativo.',
          'Requiere esfuerzo adicional para procesar información compleja.',
          'Puede establecer metas básicas pero tiene dificultad con planes complejos.',
        ],
        en: [
          'Has difficulties retaining information for moderate periods.',
          'Takes time to store multiple data in their mind.',
          'Temporary manipulation of information is an area of weakness.',
          'Tasks with high mental load represent a significant challenge.',
          'Requires additional effort to process complex information.',
          'Can establish basic goals but has difficulty with complex plans.',
        ],
      },
      strategies: {
        es: [
          'Ejercicios de memoria progresivos.',
          'Utilizar notas y recordatorios escritos.',
          'Dividir tareas complejas en pasos más pequeños.',
          'Capacitación en técnicas de memorización.',
          'Establecer rutinas para facilitar el procesamiento.',
        ],
        en: [
          'Progressive memory exercises.',
          'Use written notes and reminders.',
          'Break complex tasks into smaller steps.',
          'Training in memorization techniques.',
          'Establish routines to facilitate processing.',
        ],
      },
    },
    acceptable: {
      interpretations: {
        es: [
          'Puede retener información durante períodos razonables.',
          'Es capaz de almacenar cantidades moderadas de datos en su mente.',
          'Mantiene y manipula información de manera adecuada.',
          'Puede manejar cargas de trabajo mental normales.',
          'El procesamiento de información está dentro del rango esperado.',
          'Es capaz de establecer y seguir planes de acción básicos.',
        ],
        en: [
          'Can retain information for reasonable periods.',
          'Is capable of storing moderate amounts of data in their mind.',
          'Maintains and manipulates information adequately.',
          'Can handle normal mental workloads.',
          'Information processing is within expected range.',
          'Is capable of establishing and following basic action plans.',
        ],
      },
      strategies: {
        es: [
          'Ejercicios para mejorar la capacidad de memoria.',
          'Práctica con tareas de complejidad creciente.',
          'Técnicas de organización de información.',
          'Desarrollo de habilidades de planificación.',
        ],
        en: [
          'Exercises to improve memory capacity.',
          'Practice with tasks of increasing complexity.',
          'Information organization techniques.',
          'Development of planning skills.',
        ],
      },
    },
    high: {
      interpretations: {
        es: [
          'Retiene información durante períodos prolongados con facilidad.',
          'Almacena múltiples datos en su mente de manera eficiente.',
          'Manipula información temporal con destreza.',
          'Maneja cargas de trabajo mental altas de manera efectiva.',
          'Procesa e interpreta información rápidamente.',
          'Establece y ejecuta planes de acción complejos.',
        ],
        en: [
          'Retains information for extended periods easily.',
          'Stores multiple data in their mind efficiently.',
          'Manipulates temporary information skillfully.',
          'Handles high mental workloads effectively.',
          'Processes and interprets information quickly.',
          'Establishes and executes complex action plans.',
        ],
      },
      strategies: {
        es: [
          'Asignar tareas que requieran alta capacidad de memoria.',
          'Proyectos que impliquen planificación compleja.',
          'Entrenar a compañeros en técnicas de memoria.',
          'Desarrollo de metodologías de trabajo.',
        ],
        en: [
          'Assign tasks requiring high memory capacity.',
          'Projects involving complex planning.',
          'Train colleagues in memory techniques.',
          'Development of work methodologies.',
        ],
      },
    },
    outstanding: {
      interpretations: {
        es: [
          'Retiene grandes cantidades de información durante períodos muy prolongados.',
          'Almacena y procesa múltiples flujos de datos simultáneamente.',
          'Manipula información compleja con gran destreza.',
          'Sobresale en tareas con cargas de trabajo mental intensivas.',
          'Procesa, interpreta y aplica información de manera excepcional.',
          'Crea y ejecuta planes de acción altamente complejos.',
          'Monitorea y modifica labores según metas planificadas con precisión.',
        ],
        en: [
          'Retains large amounts of information for very extended periods.',
          'Stores and processes multiple data streams simultaneously.',
          'Manipulates complex information with great skill.',
          'Excels in tasks with intensive mental workloads.',
          'Processes, interprets, and applies information exceptionally.',
          'Creates and executes highly complex action plans.',
          'Monitors and modifies work according to planned goals with precision.',
        ],
      },
      strategies: {
        es: [
          'Liderar proyectos que requieran capacidad de memoria excepcional.',
          'Supervisar equipos en tareas de alta complejidad.',
          'Desarrollar sistemas y metodologías de trabajo.',
          'Capacitar a otros en técnicas avanzadas de memoria y planificación.',
        ],
        en: [
          'Lead projects requiring exceptional memory capacity.',
          'Supervise teams in high complexity tasks.',
          'Develop work systems and methodologies.',
          'Train others in advanced memory and planning techniques.',
        ],
      },
    },
  },

  // ============================================
  // VISUAL ROTATION (Orientación)
  // ============================================
  visual_rotation: {
    insufficient: {
      interpretations: {
        es: [
          'Se le dificulta crear y manipular imágenes mentales de los objetos.',
          'Le es difícil usar las habilidades mentales de visualización para comparar formas.',
          'Trabajar en entornos donde las habilidades de visualización sean requisitos previos para la comprensión y ejecución de tareas, será un ambiente que se le dificulta.',
          'No tendrá éxito si debe encontrar solución a problemas mecánicos o técnicos.',
        ],
        en: [
          'Has difficulty creating and manipulating mental images of objects.',
          'Finds it difficult to use mental visualization skills to compare shapes.',
          'Working in environments where visualization skills are prerequisites for understanding and executing tasks will be a difficult environment.',
          'Will not be successful if they must find solutions to mechanical or technical problems.',
        ],
      },
      strategies: {
        es: [
          'Ser constantemente capacitado por profesionales de áreas técnicas y/o mecánicas si su trabajo requiere la utilización de habilidades de orientación.',
          'Asegurarse de que la información crítica y los trabajos relacionados con orientación, sean previamente verificada por otra persona.',
          'Realizar diferentes tipos de ejercicios o actividades, tales como laberintos: en donde se deba encontrar la vía para llegar a la meta, esto puede ser de manera escrita o visual.',
        ],
        en: [
          'Be constantly trained by professionals in technical and/or mechanical areas if their work requires the use of orientation skills.',
          'Ensure that critical information and orientation-related work is previously verified by another person.',
          'Perform different types of exercises or activities, such as mazes: where one must find the way to reach the goal, this can be done in written or visual form.',
        ],
      },
    },
    low: {
      interpretations: {
        es: [
          'Presenta dificultades para crear imágenes mentales de objetos.',
          'Las habilidades de visualización espacial son limitadas.',
          'Requiere apoyo adicional en tareas que involucren orientación visual.',
          'Los problemas mecánicos o técnicos representan un desafío.',
          'La interpretación de diagramas le toma más tiempo del esperado.',
        ],
        en: [
          'Has difficulties creating mental images of objects.',
          'Spatial visualization skills are limited.',
          'Requires additional support in tasks involving visual orientation.',
          'Mechanical or technical problems represent a challenge.',
          'Diagram interpretation takes longer than expected.',
        ],
      },
      strategies: {
        es: [
          'Capacitación en habilidades de visualización espacial.',
          'Práctica con ejercicios de rotación mental.',
          'Utilizar modelos físicos cuando sea posible.',
          'Verificación de interpretaciones de diagramas.',
        ],
        en: [
          'Training in spatial visualization skills.',
          'Practice with mental rotation exercises.',
          'Use physical models when possible.',
          'Verification of diagram interpretations.',
        ],
      },
    },
    acceptable: {
      interpretations: {
        es: [
          'Es capaz de crear y manipular imágenes mentales de manera adecuada.',
          'Las habilidades de visualización espacial están dentro del rango normal.',
          'Puede trabajar en entornos que requieran orientación visual.',
          'Resuelve problemas mecánicos o técnicos de complejidad moderada.',
          'Interpreta diagramas y planos de manera satisfactoria.',
        ],
        en: [
          'Is capable of creating and manipulating mental images adequately.',
          'Spatial visualization skills are within normal range.',
          'Can work in environments requiring visual orientation.',
          'Solves mechanical or technical problems of moderate complexity.',
          'Interprets diagrams and plans satisfactorily.',
        ],
      },
      strategies: {
        es: [
          'Práctica con ejercicios de visualización más complejos.',
          'Exposición a problemas técnicos de dificultad creciente.',
          'Desarrollo de habilidades de interpretación de diagramas.',
          'Capacitación en software de diseño si es relevante.',
        ],
        en: [
          'Practice with more complex visualization exercises.',
          'Exposure to technical problems of increasing difficulty.',
          'Development of diagram interpretation skills.',
          'Training in design software if relevant.',
        ],
      },
    },
    high: {
      interpretations: {
        es: [
          'Crea y manipula imágenes mentales con facilidad.',
          'Las habilidades de visualización espacial están muy desarrolladas.',
          'Se desenvuelve bien en entornos que requieran orientación visual.',
          'Resuelve problemas mecánicos o técnicos de manera eficiente.',
          'Interpreta diagramas y planos con precisión.',
        ],
        en: [
          'Creates and manipulates mental images easily.',
          'Spatial visualization skills are well developed.',
          'Performs well in environments requiring visual orientation.',
          'Solves mechanical or technical problems efficiently.',
          'Interprets diagrams and plans with precision.',
        ],
      },
      strategies: {
        es: [
          'Asignar proyectos que requieran habilidades de visualización avanzadas.',
          'Supervisar trabajos técnicos de terceros.',
          'Entrenar a compañeros en interpretación de diagramas.',
          'Participar en diseño de soluciones técnicas.',
        ],
        en: [
          'Assign projects requiring advanced visualization skills.',
          'Supervise technical work of others.',
          'Train colleagues in diagram interpretation.',
          'Participate in technical solution design.',
        ],
      },
    },
    outstanding: {
      interpretations: {
        es: [
          'Demuestra habilidades excepcionales para crear y manipular imágenes mentales complejas.',
          'Las habilidades de visualización espacial son sobresalientes.',
          'Sobresale en entornos que requieran alta orientación visual.',
          'Resuelve problemas mecánicos o técnicos complejos con facilidad.',
          'Interpreta diagramas y planos con alta precisión y velocidad.',
          'Es capaz de visualizar soluciones antes de implementarlas.',
        ],
        en: [
          'Demonstrates exceptional skills in creating and manipulating complex mental images.',
          'Spatial visualization skills are outstanding.',
          'Excels in environments requiring high visual orientation.',
          'Solves complex mechanical or technical problems easily.',
          'Interprets diagrams and plans with high precision and speed.',
          'Is capable of visualizing solutions before implementing them.',
        ],
      },
      strategies: {
        es: [
          'Liderar proyectos técnicos de alta complejidad.',
          'Diseñar soluciones innovadoras a problemas técnicos.',
          'Capacitar y mentorear a otros en habilidades de visualización.',
          'Participar en el desarrollo de estándares técnicos.',
        ],
        en: [
          'Lead highly complex technical projects.',
          'Design innovative solutions to technical problems.',
          'Train and mentor others in visualization skills.',
          'Participate in the development of technical standards.',
        ],
      },
    },
  },
};

// Performance level display names
export const PERFORMANCE_LEVEL_DISPLAY: Record<LIAPerformanceLevel, { es: string; en: string }> = {
  insufficient: { es: 'Insuficiente', en: 'Insufficient' },
  low: { es: 'Bajo', en: 'Low' },
  acceptable: { es: 'Adecuado', en: 'Acceptable' },
  high: { es: 'Excede', en: 'Exceeds' },
  outstanding: { es: 'Excepcional', en: 'Outstanding' },
};

// Global performance level descriptions
export const GLOBAL_PERFORMANCE_DESCRIPTIONS: Record<LIAPerformanceLevel, { es: string; en: string }> = {
  insufficient: {
    es: 'Capacidad de adaptación muy limitada. Requiere desarrollo significativo en múltiples áreas.',
    en: 'Very limited adaptation capacity. Requires significant development in multiple areas.',
  },
  low: {
    es: 'Capacidad de adaptación por debajo del promedio. Beneficiaría de entrenamiento cognitivo.',
    en: 'Below-average adaptation capacity. Would benefit from cognitive training.',
  },
  acceptable: {
    es: 'Capacidad de adaptación dentro del rango normal. Adecuado para la mayoría de roles.',
    en: 'Adaptation capacity within normal range. Suitable for most roles.',
  },
  high: {
    es: 'Capacidad de adaptación superior al promedio. Ideal para roles dinámicos.',
    en: 'Above-average adaptation capacity. Ideal for dynamic roles.',
  },
  outstanding: {
    es: 'Capacidad de adaptación excepcional. Excelente para liderazgo y roles de alta complejidad.',
    en: 'Exceptional adaptation capacity. Excellent for leadership and high-complexity roles.',
  },
};

// MIL assessment intro text
export const MIL_INTRO_TEXT = {
  es: 'La prueba MIL es una herramienta utilizada para medir la inteligencia laboral, ésta se relaciona con la capacidad para aprender y desaprender, la habilidad para reaccionar ante retos y ante cambios, para adquirir nuevos conocimientos, capacidad de inferencia sobre aspectos simbólicos o abstractos, sin requerimientos especiales de contenido, conocimiento o memoria. La prueba se encuentra dividida en 5 subpruebas que se enfocan cada una en la medición de aspectos diferentes.',
  en: 'The MIL test is a tool used to measure labor intelligence, which relates to the ability to learn and unlearn, the ability to react to challenges and changes, to acquire new knowledge, the ability to make inferences about symbolic or abstract aspects, without special requirements of content, knowledge or memory. The test is divided into 5 subtests that each focus on measuring different aspects.',
};
