"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
export default function StudentDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => { router.replace(`/school-admin/users/${params.id}`); }, [router, params.id]);
  return null;
}
