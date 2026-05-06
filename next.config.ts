import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Загрузка документов клиентов до 15 МБ. Дефолт Next.js — 1 МБ
      // (отсюда «ошибка при ~2 МБ»). Server action сам ещё раз
      // проверяет размер в app/client/documents/actions.ts (MAX_BYTES).
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
