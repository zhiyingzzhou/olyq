/**
 * 说明：`NotFound` 页面模块。
 *
 * 职责：
 * - 承载 `NotFound` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';

/**
 * 路由未命中页面。
 *
 * 用于兜底所有未知路径，并在开发时输出实际访问路径便于排查路由配置问题。
 */
const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    logger.general.warn('route not found', { pathname: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t('notFound.message')}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t('notFound.backHome')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
