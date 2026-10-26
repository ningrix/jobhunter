"use client";

import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CompanyCatalog } from "@/components/company-catalog";

export default function CompanySourcesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="官方招聘导航"
        desc="140 家企业/平台官方招聘入口直达 · 看中岗位后回「职位中心」粘贴 JD 或用雷达自动扫描"
      />
      <CompanyCatalog />
      <p className="text-xs text-t3">
        <Building2 size={12} className="mr-1 inline" />
        想自动获取职位？去「职位中心」点「雷达扫描」。
      </p>
    </div>
  );
}
