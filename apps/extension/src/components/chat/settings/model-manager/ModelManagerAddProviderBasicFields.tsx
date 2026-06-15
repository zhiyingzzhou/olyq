/**
 * 说明：`ModelManagerAddProviderBasicFields` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderBasicFields` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerAddProviderBasicFieldsProps`、`ModelManagerAddProviderBasicFields` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProviderType } from '@/lib/ai/types';

import type { AddProviderFormState } from './model-manager-types';
import { Field } from './ModelManagerAddProviderSections';
import { PROVIDER_TYPE_OPTIONS } from './shared';

/** Add Provider 基础字段属性。 */
export interface ModelManagerAddProviderBasicFieldsProps {
  /** 当前表单。 */
  readonly form: AddProviderFormState;
  /** 表单 patch 回调。 */
  readonly onFormPatch: (patch: Partial<AddProviderFormState>) => void;
}

/** Add Provider 基础字段区。 */
export function ModelManagerAddProviderBasicFields(props: ModelManagerAddProviderBasicFieldsProps) {
  const { form, onFormPatch } = props;
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Field label={t('modelManagerPanel.addProviderDialog.fields.name')} required>
        <Input
          value={form.name}
          onChange={(event) => onFormPatch({ name: event.target.value })}
          placeholder={t('modelManagerPanel.addProviderDialog.fields.namePlaceholder')}
          className="text-sm h-9"
        />
      </Field>

      <Field label={t('modelManagerPanel.addProviderDialog.fields.type')}>
        <Select value={form.type} onValueChange={(value) => onFormPatch({ type: value as ProviderType })}>
          <SelectTrigger className="flex-1 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.labelKey}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('modelManagerPanel.addProviderDialog.fields.apiBase')}>
        <Input
          value={form.apiHost}
          onChange={(event) => onFormPatch({ apiHost: event.target.value })}
          className="text-sm h-9 font-mono"
        />
      </Field>

      {form.type === 'azure-openai' ? (
        <Field label={t('modelManagerPanel.addProviderDialog.fields.apiVersion')}>
          <Input
            value={form.apiVersion}
            onChange={(event) => onFormPatch({ apiVersion: event.target.value })}
            className="text-sm h-9 font-mono"
          />
        </Field>
      ) : null}
    </div>
  );
}
