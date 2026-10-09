"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  QuestionFormDialog,
  type QuestionFormState,
} from "@/app/t/questions/_components/question-form-dialog";
import { addLibraryQuestionAction } from "@/app/t/questions/actions";

export function CreateLibraryQuestionButton({
  type,
  banks,
}: {
  type: "SINGLE_CHOICE" | "FILL_BLANK";
  banks: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<QuestionFormState | undefined, FormData>(
    async (previous, formData) => addLibraryQuestionAction(type, previous, formData),
    undefined,
  );

  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [router, state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {type === "SINGLE_CHOICE" ? "新建选择题" : "新建填空题"}
      </Button>
      {open && (
        <QuestionFormDialog
          mode="add"
          initialType={type}
          fixedType={type}
          formAction={formAction}
          pending={pending}
          state={state ?? null}
          bankOptions={banks.length > 0 ? banks : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
