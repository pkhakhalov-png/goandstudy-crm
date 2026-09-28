import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ── Граница контура кабинета куратора v2 ─────────────────────────────────
  //
  // Новый контур пишет только в схему `care` под ролью `care_app`. Защита
  // стоит в базе, но до базы дело не дойдёт, если код возьмёт клиент с
  // service-role: тот обходит RLS и пишет куда угодно. В действующей CRM
  // `createAdminClient` встречается в 128 файлах, и дотянуться до него из
  // нового кода — вопрос одной строки импорта, сделанной по привычке.
  //
  // Это правило и есть то, что отличает «мы договорились так не делать» от
  // «так не получится». Область — только каталоги care, остальной код
  // работает как работал.
  {
    files: ["app/care/**/*.{ts,tsx}", "lib/care/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              message:
                "В контуре care нельзя брать клиент базы отсюда: здесь createAdminClient с service-role, он обходит RLS. Используй lib/care/db.ts — он работает под ролью care_app, которой запись в public не выдана.",
            },
            {
              name: "@/lib/supabase/client",
              message:
                "Браузерный клиент ходит под ключом пользователя мимо роли care_app. Данные контура care читаются на сервере через lib/care/db.ts.",
            },
            {
              name: "@/lib/client-data",
              message: "Модуль старой CRM: пишет в public. В контуре care данные берутся из схемы care.",
            },
            {
              name: "@/lib/roadmap-actions",
              message: "Пишет в public.clients.roadmap_data. Контур care в public не пишет (п. 0.5 плана).",
            },
            {
              name: "@/lib/student-project-actions",
              message: "Пишет в public.clients.project_data. Контур care в public не пишет (п. 0.5 плана).",
            },
            {
              name: "@/lib/curator-edit-actions",
              message: "Пишет в справочник parser-базы. Контур care ведёт свои данные в схеме care.",
            },
            {
              name: "@/lib/ai",
              message:
                "Тянет продажный системный промпт. В контуре care свой клиент модели — lib/care/ai/client.ts.",
            },
            {
              name: "@/lib/webhook-secret",
              message:
                "Общий модуль секретов не входит в список разрешённых импортов (п. 0.3 плана). В контуре care — lib/care/secret.ts.",
            },
          ],
          patterns: [
            {
              group: ["@/app/!(care)/**/actions", "@/app/!(care)/**/actions.*"],
              message:
                "Серверные действия старой CRM пишут в public. Контур care вызывает только свои операции из app/care.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
