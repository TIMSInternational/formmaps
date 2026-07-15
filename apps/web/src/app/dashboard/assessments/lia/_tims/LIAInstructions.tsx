"use client";

import { ArrowRight, Clock, AlertTriangle, Brain, Eye, Hash, MessageSquare, Shuffle } from 'lucide-react';
import { LIASubtest, SUBTEST_CONFIG, SUBTEST_ORDER } from '@/services/liaService';

interface LIAGeneralInstructionsProps {
  onContinue: () => void;
  language?: 'es' | 'en';
}

export function LIAGeneralInstructions({ onContinue, language = 'es' }: LIAGeneralInstructionsProps) {
  const content = {
    es: {
      title: 'Instrucciones Generales',
      intro: 'La Evaluación de Inteligencia Laboral (LIA) mide tu capacidad para aprender, desaprender y adaptarte a situaciones nuevas.',
      points: [
        'Consta de 5 secciones cronometradas',
        'Cada sección tiene un tiempo límite estricto',
        'No puedes volver a preguntas anteriores',
        'Las respuestas incorrectas tienen penalización',
        'Si no estás seguro, es mejor omitir la pregunta',
        'Antes de cada sección, completarás preguntas de práctica',
      ],
      subtestsTitle: 'Las 5 Secciones',
      totalTime: 'Tiempo total aproximado: 20 minutos',
      continueBtn: 'Continuar',
    },
    en: {
      title: 'General Instructions',
      intro: 'The Labor Intelligence Assessment (LIA) measures your ability to learn, unlearn, and adapt to new situations.',
      points: [
        'It consists of 5 timed sections',
        'Each section has a strict time limit',
        'You cannot return to previous questions',
        'Incorrect answers have a penalty',
        "If you're unsure, it's better to skip the question",
        "Before each section, you'll complete practice questions",
      ],
      subtestsTitle: 'The 5 Sections',
      totalTime: 'Approximate total time: 20 minutes',
      continueBtn: 'Continue',
    },
  };

  const t = content[language];

  const subtestIcons: Record<LIASubtest, React.ReactNode> = {
    pattern_recognition: <Eye className="w-5 h-5" />,
    verbal_reasoning: <MessageSquare className="w-5 h-5" />,
    numerical_speed: <Hash className="w-5 h-5" />,
    working_memory: <Brain className="w-5 h-5" />,
    visual_rotation: <Shuffle className="w-5 h-5" />,
  };

  return (
    <div className="flex items-center justify-center p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-sm p-8">
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {t.title}
        </h1>

        {/* Intro */}
        <p className="text-gray-600 mb-6">
          {t.intro}
        </p>

        {/* Key points */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-6">
          <ul className="space-y-3">
            {t.points.map((point, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#102B47] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span className="text-sm text-gray-700">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Penalty warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            {language === 'es'
              ? 'Las respuestas incorrectas restan puntos. Si no estás seguro de una respuesta, es mejor omitirla.'
              : "Incorrect answers deduct points. If you're unsure about an answer, it's better to skip it."}
          </p>
        </div>

        {/* Subtests overview */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          {t.subtestsTitle}
        </h2>
        <div className="space-y-2 mb-6">
          {SUBTEST_ORDER.map((subtest, i) => {
            const config = SUBTEST_CONFIG[subtest];
            return (
              <div
                key={subtest}
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="w-7 h-7 rounded-full bg-[#102B47] text-white flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </div>
                <div className="text-[#102B47]">
                  {subtestIcons[subtest]}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">
                    {config.displayName[language]}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{Math.floor(config.timeSeconds / 60)} min</span>
                </div>
                <div className="text-xs text-gray-500">
                  {config.itemCount} {language === 'es' ? 'ítems' : 'items'}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-gray-500 mb-6">
          {t.totalTime}
        </p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="w-full py-3 px-6 bg-[#102B47] hover:bg-[#0b1f33] text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {t.continueBtn}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// Subtest-specific introduction
interface LIASubtestIntroProps {
  subtest: LIASubtest;
  subtestNumber: number;
  onStartPractice: () => void;
  language?: 'es' | 'en';
}

export function LIASubtestIntro({
  subtest,
  subtestNumber,
  onStartPractice,
  language = 'es',
}: LIASubtestIntroProps) {
  const config = SUBTEST_CONFIG[subtest];

  const descriptions: Record<LIASubtest, { es: string; en: string; example: React.ReactNode }> = {
    pattern_recognition: {
      es: 'Verás dos filas de 4 letras. Debes contar cuántas columnas tienen letras iguales (sin importar mayúsculas/minúsculas).',
      en: "You'll see two rows of 4 letters. Count how many columns have matching letters (case-insensitive).",
      example: (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <div className="grid grid-cols-4 gap-4 text-2xl font-mono text-center text-gray-900">
            <span>q</span><span>P</span><span>d</span><span>T</span>
            <span>Q</span><span>p</span><span>D</span><span>t</span>
          </div>
          <p className="text-center mt-4 text-sm text-gray-500">
            {language === 'es' ? 'Respuesta: 4 (todas coinciden)' : 'Answer: 4 (all match)'}
          </p>
        </div>
      ),
    },
    verbal_reasoning: {
      es: 'Lee las premisas y responde la pregunta seleccionando la opción correcta (A, B o C).',
      en: 'Read the premises and answer the question by selecting the correct option (A, B, or C).',
      example: (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-2 text-gray-700">
          <p className="italic">"Mateo es más lento que Liam"</p>
          <p className="italic">"Liam es más rápido que Pedro"</p>
          <p className="font-semibold mt-2 text-gray-900">¿Quién es el más lento?</p>
          <p className="text-sm text-gray-500">
            {language === 'es' ? 'Respuesta: Mateo o Pedro (depende de los datos)' : 'Answer: Mateo or Pedro (depends on data)'}
          </p>
        </div>
      ),
    },
    numerical_speed: {
      es: 'Verás 3 números. Identifica cuál está más lejos del valor medio.',
      en: "You'll see 3 numbers. Identify which one is furthest from the middle value.",
      example: (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <div className="flex justify-center gap-8 text-2xl font-bold text-gray-900">
            <span>[A] 6</span>
            <span>[B] 11</span>
            <span>[C] 17</span>
          </div>
          <p className="text-center mt-4 text-sm text-gray-500">
            {language === 'es'
              ? 'El valor medio es 11. |6-11|=5, |17-11|=6. Respuesta: C'
              : 'Middle value is 11. |6-11|=5, |17-11|=6. Answer: C'}
          </p>
        </div>
      ),
    },
    working_memory: {
      es: 'Verás 3 letras. Determina cuál letra exterior está más lejos alfabéticamente de la letra central.',
      en: "You'll see 3 letters. Determine which outer letter is furthest alphabetically from the middle letter.",
      example: (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <div className="flex justify-center gap-8 text-4xl font-mono font-bold">
            <span className="text-gray-900">K</span>
            <span className="text-gray-400">N</span>
            <span className="text-gray-900">R</span>
          </div>
          <p className="text-center mt-4 text-sm text-gray-500">
            {language === 'es'
              ? 'N está en posición 14. K=11 (distancia 3), R=18 (distancia 4). Respuesta: derecha (R)'
              : 'N is at position 14. K=11 (distance 3), R=18 (distance 4). Answer: right (R)'}
          </p>
        </div>
      ),
    },
    visual_rotation: {
      es: 'Verás 2 filas de 3 figuras R. Cuenta cuántas columnas tienen figuras iguales (las rotaciones coinciden, los espejos no).',
      en: "You'll see 2 rows of 3 R figures. Count how many columns have matching figures (rotations match, mirrors don't).",
      example: (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-3xl font-serif text-center text-gray-900">
            <span>R</span>
            <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>R</span>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>R</span>
            <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>R</span>
            <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>R</span>
            <span>R</span>
          </div>
          <p className="text-center mt-4 text-sm text-gray-500">
            {language === 'es'
              ? 'Col 1: R normal vs R rotada = coinciden. Col 2: espejo vs espejo = coinciden. Col 3: R180 vs R = coinciden.'
              : 'Col 1: normal R vs rotated R = match. Col 2: mirror vs mirror = match. Col 3: R180 vs R = match.'}
          </p>
        </div>
      ),
    },
  };

  const desc = descriptions[subtest];

  return (
    <div className="flex items-center justify-center p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-sm p-8">
        {/* Section number */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 rounded-full bg-[#102B47] text-white flex items-center justify-center text-lg font-bold">
            {subtestNumber}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {config.displayName[language]}
            </h1>
            <p className="text-sm text-gray-500">
              {config.itemCount} {language === 'es' ? 'ítems' : 'items'} · {Math.floor(config.timeSeconds / 60)} {language === 'es' ? 'minutos' : 'minutes'}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-600 mb-6">
          {desc[language]}
        </p>

        {/* Example */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {language === 'es' ? 'Ejemplo' : 'Example'}
          </h3>
          {desc.example}
        </div>

        {/* Practice notice */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Brain className="w-5 h-5 text-[#102B47] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">
            {language === 'es'
              ? 'Primero completarás 3 preguntas de práctica sin límite de tiempo para familiarizarte con el formato.'
              : "First, you'll complete 3 practice questions without a time limit to familiarize yourself with the format."}
          </p>
        </div>

        {/* Start practice button */}
        <button
          onClick={onStartPractice}
          className="w-full py-3 px-6 bg-[#102B47] hover:bg-[#0b1f33] text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {language === 'es' ? 'Comenzar Práctica' : 'Start Practice'}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
