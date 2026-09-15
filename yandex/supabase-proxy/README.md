# supabase-proxy

Прокси только к https://piwxslgxwmdrehnomymt.supabase.co. Серверных ключей,
переменных окружения и доступа к БД у самой функции нет. RLS и проверка
ключа редактора остаются в Supabase. Тела запросов и заголовки не логируются.

## Развёртывание
1. Создать Cloud Function `supabase-proxy` в Yandex Cloud.
2. Загрузить `outputs/supabase-proxy.zip`: Node.js 22, `index.handler`,
   128 МБ, таймаут 30 секунд; без переменных и сервисного аккаунта.
3. Включить публичный доступ. Таймер не требуется.
4. В config.js задать URL функции в STAROSTA_SUPABASE_URL,
   а исходный URL проекта — в STAROSTA_SUPABASE_FALLBACK_URL.

Прямой HTTP-вызов Cloud Functions не передаёт путь в событии, поэтому
путь Supabase вместе с его query передаётся как `?path=` (URL encoding).
Ключ редактора и JSON журнала остаются только в теле POST.
Yandex удаляет Authorization: api-transport.js передаёт его как
X-Supabase-Authorization; функция восстанавливает исходное значение.
https://yandex.cloud/en/docs/functions/concepts/function-invoke

Эндпоинты клиента:
- POST /rest/v1/rpc/starosta_state — session/read/write; revision защищает запись.
- GET /functions/v1/fetch-schedule — чтение общего снимка.
Ручное обновление БГТУ по-прежнему вызывает bgtu-sync напрямую.

CORS: https://crown350.github.io. Ответы журнала не кэшируются; статус и байты
ответа Supabase сохраняются. Транспортные hop-by-hop заголовки исключены.
Ограничение ответа: 3 МиБ, таймаут upstream 18 секунд. Потоковый/WebSocket
режим не поддерживается (клиент его не использует).

При сетевом сбое или таймауте (6 секунд на маршрут) клиент делает один прямой запрос с тем же телом и ревизией.
HTTP-ответы, включая 401/403/409/429/5xx, не повторяются. Если оба маршрута недоступны, предлагается попробовать VPN. Если первая запись прошла, но ответ
потерян, повтор получит 409: клиент покажет конфликт и сохранит черновик.
Если оба маршрута расписания недоступны, остаётся schedule.json.
