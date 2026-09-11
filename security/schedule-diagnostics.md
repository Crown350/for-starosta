# Историческая проверка из Supabase — 8 сентября 2026

> Архив диагностики. Описанный ниже Actions-cron отключён 10 сентября 2026 года. Сейчас расписание получает Yandex bgtu-sync: почасовой bgtu-hourly и кнопка приложения. GitHub Actions только публикует Pages.

Исходный запрос с таймаутом 15 секунд не завершался. Браузерные User-Agent,
Accept, Accept-Language и Referer и увеличение лимита до 25 секунд не помогли:

| Адрес /education/schedule/ | Результат | Время |
| --- | --- | --- |
| https://www.tu-bryansk.ru | TimeoutError, без HTTP-ответа | 25001 мс |
| https://tu-bryansk.ru | TimeoutError, без HTTP-ответа | 25002 мс |
| http://www.tu-bryansk.ru | TimeoutError, без HTTP-ответа | 25001 мс |
| http://tu-bryansk.ru | TimeoutError, без HTTP-ответа | 25001 мс |

Точную причину сетевой недоступности (маршрут/фильтрация на стороне БГТУ)
по таймауту установить нельзя. Тот же парсер локально получает 25 занятий.
Диагностический код убран из Edge после проверки.

Схема на момент диагностики (больше не используется): Actions получает БГТУ, publish-schedule принимает снимок только
с подписанным GitHub OIDC-токеном Pages workflow из main; fetch-schedule только
читает БД. Без editor key разрешено чтение, запись напрямую закрыта.
Подпись, issuer, audience, repository_id, repository_owner_id, environment,
ref, workflow_ref и срок токена
проверяются на сервере. Долгоживущие секреты в Actions не требуются.
Справка: https://docs.github.com/en/actions/reference/security/oidc

На момент диагностики cron Actions был `17 */3 * * *`. pg_cron/pg_net в проекте не установлены,
задание Supabase не создавалось. Задержка до трёх часов при штатных запусках,
при сбоях БГТУ/Actions дольше. Пустой или более старый снимок не заменяет БД.

## Вывод из эксплуатации — 11 сентября 2026
Клиент scripts/publish-schedule.cjs и исходники supabase/functions/publish-schedule удалены: workflow больше их не использует. Развёрнутый publish-schedule в Supabase при проверке ещё ACTIVE; его удаление в облаке пока не выполнено. Наличие отдельной одноимённой функции в Yandex не проверено. bgtu-sync и fetch-schedule используются и должны оставаться.
