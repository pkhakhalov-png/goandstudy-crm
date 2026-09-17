import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Загрузка документов клиентов до 15 МБ. Дефолт Next.js — 1 МБ
      // (отсюда «ошибка при ~2 МБ»). Server action сам ещё раз
      // проверяет размер в app/client/documents/actions.ts (MAX_BYTES).
      bodySizeLimit: '15mb',
      // Форма записи отдаётся посетителю через goandstudy.com: сайт стоит в
      // Москве и доступен всем, а CRM живёт на Vercel, куда часть людей из
      // России не доходит. При такой раздаче заголовок Host приходит чужой, и
      // Next по умолчанию отвергает серверные действия как межсайтовые.
      allowedOrigins: ['goandstudy.com', 'www.goandstudy.com', 'crm.goandstudy.com'],
    },
  },
};

export default nextConfig;
