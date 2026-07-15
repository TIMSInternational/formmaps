import { getVocationalForm, submitVocationalAnswers } from "../vocationalTakeService";

describe("vocationalTakeService", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("GETs the form by token and unwraps {success,data}", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { group: "teacher", questions: [{ number: 1, type: "likert" }] } }) }) as any;
    const form = await getVocationalForm("tok");
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/evaluation/vocational/tok");
    expect(form.questions).toHaveLength(1);
  });

  it("POSTs answers to /submit with {token,answers}", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ok: true, count: 1 } }) }) as any;
    await submitVocationalAnswers("tok", [{ questionNumber: 1, type: "likert", ratingValue: 4 }]);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/evaluation/vocational/submit");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ token: "tok", answers: [{ questionNumber: 1, type: "likert", ratingValue: 4 }] });
  });

  it("throws on a non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ success: false, message: "Invalid" }) }) as any;
    await expect(submitVocationalAnswers("tok", [])).rejects.toThrow();
  });
});
