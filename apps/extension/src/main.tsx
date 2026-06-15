/**
 * 说明：`main` 源码模块。
 *
 * 职责：
 * - 承载 `main` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { runStartupPersistenceMigrations } from '@/lib/persistence/schema-migration-engine';
import { logger } from '@/lib/logger';

/** 挂载扩展主应用到根节点。 */
void runStartupPersistenceMigrations()
  .catch((error) => {
    logger.general.error('persistence startup migration failed', error);
  })
  .finally(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
