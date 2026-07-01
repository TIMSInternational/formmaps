"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getVocationalForm, submitVocationalAnswers, VocationalForm, VocationalQuestionItem, VocationalSubmitAnswer } from "@/services/vocationalTakeService";
import { VocationalQuestionCard, VocationalAnswerValue } from "./VocationalQuestionCard";

function toAnswer(q: VocationalQuestionItem, v: VocationalAnswerValue): VocationalSubmitAnswer | null {
  if (q.type === "likert") return typeof v.ratingValue === "number" ? { questionNumber: q.number, type: "likert", ratingValue: v.ratingValue } : null;
  if (q.type === "ranking") return v.rankingOrder?.length ? { questionNumber: q.number, type: "ranking", rankingOrder: v.rankingOrder } : null;
  if (q.type === "multi_select") return v.selectedValues?.length ? { questionNumber: q.number, type: "multi_select", selectedValues: v.selectedValues } : null;
  if (q.type === "single_select") return v.textValue ? { questionNumber: q.number, type: "single_select", textValue: v.textValue } : null;
  return v.textValue?.trim() ? { questionNumber: q.number, type: "open", textValue: v.textValue } : null;
}

export function VocationalEvaluator({ token }: { token: string; language?: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<VocationalForm | null>(null);
  const [responses, setResponses] = useState<Record<number, VocationalAnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const f = await getVocationalForm(token);
      setForm(f);
      // seed ranking defaults so an untouched ranking still submits in order
      const seed: Record<number, VocationalAnswerValue> = {};
      for (const q of f.questions ?? []) {
        if (q.type === "ranking" && q.options?.length) {
          seed[q.number] = { rankingOrder: q.options.map((o, i) => ({ value: o.value, rank: i + 1 })) };
        }
      }
      setResponses(seed);
    } catch { setError(true); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-muted-foreground" role="status">{t("evaluation.vocational.loading")}</div>;
  if (error) return <div className="p-8 text-center" role="alert">{t("evaluation.vocational.loadError")}</div>;
  if (form?.completed || done) return <div className="p-8 text-center"><h2 className="text-lg font-bold text-foreground">{t("evaluation.vocational.alreadyTitle")}</h2><p className="text-sm text-muted-foreground">{t("evaluation.vocational.alreadyBody")}</p></div>;

  const questions = form?.questions ?? [];
  const setResp = (n: number, v: VocationalAnswerValue) => setResponses((p) => ({ ...p, [n]: v }));

  const handleSubmit = async () => {
    const answers = questions.map((q) => toAnswer(q, responses[q.number] ?? {})).filter((a): a is VocationalSubmitAnswer => a !== null);
    setSubmitting(true);
    try {
      await submitVocationalAnswers(token, answers);
      setDone(true);
      toast.success(t("evaluation.vocational.submitted"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("evaluation.vocational.submitFailed"));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t("evaluation.vocational.label")}</span>
        <h1 className="text-2xl font-bold text-foreground">{t("evaluation.vocational.title")}</h1>
        {form?.studentName && <p className="text-sm text-muted-foreground">{t("evaluation.vocational.about", { name: form.studentName })}</p>}
      </header>
      {questions.map((q) => (
        <div key={q.number} className="dash-card p-4 space-y-3" style={{ background: "var(--admin-bg-card)" }}>
          <p className="text-sm font-semibold text-foreground"><span aria-hidden="true">{q.number}.&nbsp;</span><span>{q.text}</span></p>
          <VocationalQuestionCard question={q} value={responses[q.number]} onChange={(v) => setResp(q.number, v)} />
        </div>
      ))}
      <button type="button" onClick={handleSubmit} disabled={submitting}
        className="w-full h-11 rounded-lg font-semibold text-white disabled:opacity-60"
        style={{ background: "#102B47" }}>
        {submitting ? t("evaluation.vocational.submitting") : t("evaluation.vocational.submit")}
      </button>
    </div>
  );
}

export default VocationalEvaluator;
