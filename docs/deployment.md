# Развертывание dsh-tts

## Процедура релиза

1. Все изменения разрабатываются в изолированном worktree.
2. Прогон обязательных проверок:
   - `npm run check:client`
   - `npm test`
   - `bash scripts/publish-github.sh --check`
   - `bash ~/.dsh/skills/dsh-plugin-preflight/scripts/preflight.sh .`
3. Создание Pull Request в Gitea и объединение в `main`.
4. Тестирование на тестовом стенде MiniPC (`192.168.1.123`).
5. После подтверждения пользователя: публикация версии в npm и обновление на production MiniAI (`192.168.1.111`).
