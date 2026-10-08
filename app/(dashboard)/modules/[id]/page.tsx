"use client";

import { useParams } from "next/navigation";
import ModuleEditor from "@/components/module-editor";

export default function EditModulePage() {
  const { id } = useParams<{ id: string }>();
  return <ModuleEditor key={id} moduleId={id} />;
}
