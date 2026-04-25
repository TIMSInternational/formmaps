"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { TemplateDebugPage } from '../_components/TemplateDebugPage';

export default function DebugPage() {
  const router = useRouter();

  const handleClose = () => {
    router.push('/dashboard/resume-builder');
  };

  return <TemplateDebugPage onClose={handleClose} />;
}
