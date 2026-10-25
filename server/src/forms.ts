/**
 * opencode v2 replaced the "question" tool with generic forms
 * (`GET /api/form`, `POST /api/session/{id}/form/{formID}/reply`). The aiman UI
 * still renders v1 question prompts, so map forms onto that shape.
 */

export type FormField = {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  options?: { value: string; label: string; description?: string }[];
  custom?: boolean;
  default?: any;
};

export type FormInfo = {
  id: string;
  sessionID: string;
  title: string;
  metadata?: any;
  fields: FormField[];
  state?: { status: string; answer?: any; message?: string };
};

export function formToQuestion(form: FormInfo) {
  const fields = (form.fields ?? []).filter((f) => f.type !== "external" && !f.hidden);
  return {
    id: form.id,
    sessionID: form.sessionID,
    questions: fields.map((f) => {
      const header = f.title || f.key;
      const question = f.description || f.title || f.key;
      let options: { label: string; description: string }[] = [];
      if (f.type === "boolean") {
        options = [
          { label: "Yes", description: "" },
          { label: "No", description: "" },
        ];
      } else if (Array.isArray(f.options)) {
        options = f.options.map((o) => ({ label: o.value ?? o.label, description: o.description ?? o.label ?? "" }));
      }
      return {
        question,
        header,
        options,
        multiple: f.type === "multiselect",
        custom: f.type === "boolean" ? false : f.custom !== false,
      };
    }),
    // Keep the original fields so replies can be encoded back correctly.
    _fields: fields,
  };
}

/** Convert the UI's positional answers into a v2 form answer record. */
export function answersToForm(form: FormInfo, answers: string[][]): Record<string, any> {
  const fields = (form.fields ?? []).filter((f) => f.type !== "external" && !f.hidden);
  const answer: Record<string, any> = {};
  fields.forEach((f, i) => {
    const values = answers[i] ?? [];
    if (!values.length) return;
    if (f.type === "multiselect") {
      answer[f.key] = values.map(String);
    } else if (f.type === "boolean") {
      answer[f.key] = String(values[0]).toLowerCase() === "yes" || values[0] === "true";
    } else if (f.type === "number" || f.type === "integer") {
      const n = Number(values[values.length - 1]);
      answer[f.key] = Number.isFinite(n) ? n : 0;
    } else {
      answer[f.key] = String(values[values.length - 1] ?? "");
    }
  });
  return answer;
}
