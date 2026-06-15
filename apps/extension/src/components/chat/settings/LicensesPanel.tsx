/**
 * 说明：`LicensesPanel` 组件模块。
 *
 * 职责：
 * - 承载 `LicensesPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LicensesPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from "./layout";

// 说明：扩展运行时只内联自身 MIT 许可；完整第三方声明留在发行源码里，
// 避免把规则来源记录或上游品牌边界说明打进用户运行时代码。

// Vite raw imports（构建时内联为字符串）
import mitLicenseText from "../../../../../../LICENSE?raw";

/**
 * 许可协议面板。
 *
 * 通过构建期 raw import 直接在扩展 UI 内展示自身许可证文本。
 */
export function LicensesPanel() {
  const { t } = useTranslation();

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t("licenses.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("licenses.description")}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-sm">
          {t("licenses.olyqLicenseLine")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("licenses.usageNotice")}
        </p>
      </div>

      <Accordion type="multiple" className="w-full">
        <AccordionItem value="mit">
          <AccordionTrigger>{t("licenses.mitTitle")}</AccordionTrigger>
          <AccordionContent>
            <ScrollArea className="h-64 rounded-md border border-border bg-muted/30">
              <pre className="p-3 text-xs whitespace-pre-wrap leading-relaxed">{mitLicenseText}</pre>
            </ScrollArea>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
